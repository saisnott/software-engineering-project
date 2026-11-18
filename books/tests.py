from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Book, BookCopy, Category, Comment, Borrowing, Notification

User = get_user_model()


class BookstoreAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='reader1',
            email='reader1@example.com',
            password='password123',
            age=25
        )
        self.other_user = User.objects.create_user(
            username='reader2',
            email='reader2@example.com',
            password='password123',
            age=30
        )
        self.staff_user = User.objects.create_user(
            username='manager',
            email='manager@example.com',
            password='password123',
            is_staff=True
        )
        self.category = Category.objects.create(name='رمان و داستان', slug='novel')
        self.book = Book.objects.create(
            user=self.user,
            title='شازده کوچولو',
            author='آنتوان دو سنت اگزوپری',
            description='داستانی فلسفی و ماندگار',
            price=15.50,
            category=self.category,
            is_available=True
        )

    def test_list_books_and_filters(self):
        res = self.client.get('/api/books/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)

        # Filter by category
        res = self.client.get('/api/books/?category=novel')
        self.assertEqual(len(res.data), 1)

        res = self.client.get('/api/books/?category=nonexistent')
        self.assertEqual(len(res.data), 0)

        # Search by title or author
        res = self.client.get('/api/books/?search=شازده')
        self.assertEqual(len(res.data), 1)

    def test_create_comment_without_explicit_book_field(self):
        """Posting a comment to /api/books/<id>/comments/ should not require 'book' in request body."""
        self.client.force_authenticate(user=self.other_user)
        res = self.client.post(f'/api/books/{self.book.id}/comments/', {
            'text': 'کتاب فوق‌العاده‌ای بود!',
            'does_recommend': True
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Comment.objects.count(), 1)
        self.assertEqual(Comment.objects.first().book, self.book)

    def test_borrow_and_return_flow(self):
        self.client.force_authenticate(user=self.other_user)

        # Borrow book
        res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.book.refresh_from_db()
        self.assertFalse(self.book.is_available)

        # Attempting to borrow again while unavailable should fail with 400
        res2 = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        # Return book
        borrowing_id = res.data['borrowing']['id']
        res_return = self.client.post(f'/api/borrowings/{borrowing_id}/return/')
        self.assertEqual(res_return.status_code, status.HTTP_200_OK)
        self.book.refresh_from_db()
        self.assertTrue(self.book.is_available)

    def test_wishlist_toggle_and_dashboard(self):
        self.client.force_authenticate(user=self.other_user)

        # Add to wishlist
        res = self.client.post(f'/api/books/{self.book.id}/wishlist/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_wishlisted'])

        # Check dashboard wishlist
        dash = self.client.get('/api/dashboard/')
        self.assertEqual(dash.status_code, status.HTTP_200_OK)
        self.assertEqual(len(dash.data['wishlist']), 1)

        # Remove from wishlist
        res2 = self.client.post(f'/api/books/{self.book.id}/wishlist/')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertFalse(res2.data['is_wishlisted'])

    def test_clear_book_category_on_patch(self):
        """Owner should be able to clear a book's category by sending empty category."""
        self.client.force_authenticate(user=self.user)
        res = self.client.patch(f'/api/books/{self.book.id}/', {'category': ''})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.book.refresh_from_db()
        self.assertIsNone(self.book.category)

    def test_profile_cannot_escalate_privileges(self):
        """Regular user must not be able to set is_staff or is_superuser via profile PATCH."""
        self.client.force_authenticate(user=self.other_user)
        res = self.client.patch('/api/auth/profile/', {
            'is_staff': True,
            'is_superuser': True
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.other_user.refresh_from_db()
        self.assertFalse(self.other_user.is_staff)
        self.assertFalse(self.other_user.is_superuser)

    def test_manager_stats_permissions(self):
        # Regular user forbidden
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/manager/stats/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Staff user allowed
        self.client.force_authenticate(user=self.staff_user)
        res2 = self.client.get('/api/manager/stats/')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['total_books'], 1)

    def test_negative_price_rejected(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.post('/api/books/', {
            'title': 'کتاب تست',
            'author': 'نویسنده تست',
            'description': 'توضیحات',
            'price': -10.00
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_comments_hidden_in_book_detail(self):
        Comment.objects.create(
            user=self.user,
            book=self.book,
            text='نظر تایید شده',
            is_active=True
        )
        Comment.objects.create(
            user=self.other_user,
            book=self.book,
            text='نظر غیرفعال شده',
            is_active=False
        )
        res = self.client.get(f'/api/books/{self.book.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['comments']), 1)
        self.assertEqual(res.data['comments'][0]['text'], 'نظر تایید شده')

    def test_non_owner_cannot_update_or_delete_book(self):
        self.client.force_authenticate(user=self.other_user)
        res_patch = self.client.patch(f'/api/books/{self.book.id}/', {'title': 'هک شده'})
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        res_del = self.client.delete(f'/api/books/{self.book.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_403_FORBIDDEN)

    def test_star_rating_and_average_calculation(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(f'/api/books/{self.book.id}/comments/', {
            'text': 'عالی',
            'rating': 5,
            'does_recommend': True
        }, format='json')

        self.client.force_authenticate(user=self.other_user)
        self.client.post(f'/api/books/{self.book.id}/comments/', {
            'text': 'خوب بود',
            'rating': 3,
            'does_recommend': True
        }, format='json')

        res = self.client.get(f'/api/books/{self.book.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['average_rating'], 4.0)
        self.assertEqual(res.data['ratings_count'], 2)

    def test_extend_borrowing_and_waitlist_reservation(self):
        # User 2 borrows the book
        self.client.force_authenticate(user=self.other_user)
        borrow_res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(borrow_res.status_code, status.HTTP_201_CREATED)
        borrowing_id = borrow_res.data['borrowing']['id']

        # User 2 extends the loan once (+7 days)
        ext_res = self.client.post(f'/api/borrowings/{borrowing_id}/extend/')
        self.assertEqual(ext_res.status_code, status.HTTP_200_OK)
        self.assertTrue(ext_res.data['borrowing']['is_extended'])

        # Extending a second time should fail with 400
        ext_res2 = self.client.post(f'/api/borrowings/{borrowing_id}/extend/')
        self.assertEqual(ext_res2.status_code, status.HTTP_400_BAD_REQUEST)

        # User 1 reserves the borrowed book on the waitlist
        self.client.force_authenticate(user=self.user)
        res_wait = self.client.post(f'/api/books/{self.book.id}/reserve/')
        self.assertEqual(res_wait.status_code, status.HTTP_200_OK)
        self.assertTrue(res_wait.data['is_reserved_by_user'])
        self.assertEqual(res_wait.data['waitlist_count'], 1)

    def test_change_password_and_staff_category_management(self):
        # Change password for regular user
        self.client.force_authenticate(user=self.user)
        pw_res = self.client.post('/api/auth/change-password/', {
            'old_password': 'password123',
            'new_password': 'newpassword456'
        }, format='json')
        self.assertEqual(pw_res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('newpassword456'))

        # Staff creates a new category
        self.client.force_authenticate(user=self.staff_user)
        cat_res = self.client.post('/api/categories/', {
            'name': 'تاریخ و تمدن',
            'slug': 'history'
        }, format='json')
        self.assertEqual(cat_res.status_code, status.HTTP_201_CREATED)
        cat_id = cat_res.data['id']

        # Staff deletes the category
        del_res = self.client.delete(f'/api/categories/{cat_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

    def test_superuser_user_management_and_borrower_name(self):
        superuser = User.objects.create_superuser(
            username='admin_root',
            email='root@example.com',
            password='password123'
        )

        # Staff user (not superuser) should be forbidden from /api/auth/users/
        self.client.force_authenticate(user=self.staff_user)
        staff_res = self.client.get('/api/auth/users/')
        self.assertEqual(staff_res.status_code, status.HTTP_403_FORBIDDEN)

        # Superuser can list all users
        self.client.force_authenticate(user=superuser)
        list_res = self.client.get('/api/auth/users/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(list_res.data), 4)

        # Superuser can create a new staff user
        create_res = self.client.post('/api/auth/users/', {
            'username': 'new_staff',
            'email': 'new_staff@example.com',
            'password': 'password123',
            'age': 28,
            'is_staff': True,
            'is_superuser': False
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        new_user_id = create_res.data['id']

        # Superuser can update role
        patch_res = self.client.patch(f'/api/auth/users/{new_user_id}/', {
            'is_staff': False
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertFalse(patch_res.data['is_staff'])

        # Superuser cannot demote or delete themselves
        self_demote = self.client.patch(f'/api/auth/users/{superuser.id}/', {
            'is_superuser': False
        }, format='json')
        self.assertEqual(self_demote.status_code, status.HTTP_400_BAD_REQUEST)

        self_delete = self.client.delete(f'/api/auth/users/{superuser.id}/')
        self.assertEqual(self_delete.status_code, status.HTTP_400_BAD_REQUEST)

        # Superuser can delete another user
        del_user_res = self.client.delete(f'/api/auth/users/{new_user_id}/')
        self.assertEqual(del_user_res.status_code, status.HTTP_204_NO_CONTENT)

        # Borrow a book and verify borrower_name and current_borrower are exposed
        self.other_user.first_name = 'سارا'
        self.other_user.last_name = 'محمدی'
        self.other_user.save()
        self.client.force_authenticate(user=self.other_user)
        self.client.post(f'/api/books/{self.book.id}/borrow/')

        # Check manager stats for borrower_name in all_borrowings and current_borrower in recent_books
        self.client.force_authenticate(user=self.staff_user)
        stats_res = self.client.get('/api/manager/stats/')
        self.assertEqual(stats_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(stats_res.data['all_borrowings']), 1)
        self.assertEqual(stats_res.data['all_borrowings'][0]['borrower_name'], 'سارا محمدی')
        self.assertEqual(stats_res.data['all_borrowings'][0]['username'], 'reader2')
        self.assertEqual(stats_res.data['recent_books'][0]['current_borrower'], 'سارا محمدی')

    def test_borrowing_history_endpoints_and_user_activity_timeline(self):
        # User 2 borrows the book and extends it
        self.client.force_authenticate(user=self.other_user)
        b_res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(b_res.status_code, status.HTTP_201_CREATED)
        borrowing_id = b_res.data['borrowing']['id']

        self.client.post(f'/api/borrowings/{borrowing_id}/extend/')
        self.client.post(f'/api/books/{self.book.id}/comments/', {
            'text': 'کتاب بسیار آموزنده‌ای بود.',
            'rating': 5,
            'does_recommend': True
        }, format='json')

        # Staff processes the return of the book
        self.client.force_authenticate(user=self.staff_user)
        ret_res = self.client.post(f'/api/borrowings/{borrowing_id}/return/')
        self.assertEqual(ret_res.status_code, status.HTTP_200_OK)

        # Admin queries borrowing history for this specific book
        hist_book = self.client.get(f'/api/borrowings/history/?book_id={self.book.id}')
        self.assertEqual(hist_book.status_code, status.HTTP_200_OK)
        self.assertEqual(hist_book.data['summary']['total_records'], 1)
        self.assertEqual(hist_book.data['summary']['returned_count'], 1)
        self.assertIn('manager', hist_book.data['results'][0]['returned_by_label'])

        # Admin queries borrowing history for User 2
        hist_user = self.client.get(f'/api/borrowings/history/?user_id={self.other_user.id}')
        self.assertEqual(hist_user.status_code, status.HTTP_200_OK)
        self.assertEqual(hist_user.data['summary']['total_records'], 1)
        self.assertEqual(hist_user.data['results'][0]['book'], self.book.id)

        # Staff sees borrowing_history on BookDetailAPIView
        detail_staff = self.client.get(f'/api/books/{self.book.id}/')
        self.assertEqual(len(detail_staff.data['borrowing_history']), 1)

        # Regular user does not see admin borrowing_history on BookDetailAPIView, but sees their own dashboard timeline
        self.client.force_authenticate(user=self.other_user)
        detail_user = self.client.get(f'/api/books/{self.book.id}/')
        self.assertEqual(len(detail_user.data['borrowing_history']), 0)

        dash_res = self.client.get('/api/dashboard/')
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dash_res.data['reading_stats']['total_returned'], 1)
        self.assertEqual(dash_res.data['reading_stats']['on_time_rate'], 100)
        self.assertGreaterEqual(len(dash_res.data['activity_timeline']), 4)

    def test_multipart_book_create_and_edit_keeps_is_available_true(self):
        """Creating or editing a book via multipart/form-data without is_available must keep is_available=True."""
        self.client.force_authenticate(user=self.user)
        create_res = self.client.post('/api/books/', {
            'title': 'کتاب تست جدید',
            'author': 'نویسنده تست',
            'description': 'توضیحات کتاب تست',
            'price': '25.00',
        }, format='multipart')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(create_res.data['is_available'])

        book_id = create_res.data['id']
        patch_res = self.client.patch(f'/api/books/{book_id}/', {
            'title': 'کتاب تست ویرایش شده',
        }, format='multipart')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertTrue(patch_res.data['is_available'])

    def test_notifications_lifecycle(self):
        # 1. User 2 borrows User 1's book -> creates borrow notification for User 2
        self.client.force_authenticate(user=self.other_user)
        borrow_res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        borrowing_id = borrow_res.data['borrowing']['id']

        # 2. User 1 joins waitlist for the borrowed book
        self.client.force_authenticate(user=self.user)
        self.client.post(f'/api/books/{self.book.id}/reserve/')

        # 3. User 2 posts a comment on User 1's book -> creates comment notification for User 1
        self.client.force_authenticate(user=self.other_user)
        self.client.post(f'/api/books/{self.book.id}/comments/', {
            'text': 'عالی بود',
            'rating': 5,
            'does_recommend': True
        }, format='json')

        # 4. Staff returns the book -> creates return notification for User 2 AND waitlist notification for User 1
        self.client.force_authenticate(user=self.staff_user)
        self.client.post(f'/api/borrowings/{borrowing_id}/return/')

        # Verify User 1 has both 'comment' and 'waitlist' unread notifications
        self.client.force_authenticate(user=self.user)
        notif_res = self.client.get('/api/notifications/')
        self.assertEqual(notif_res.status_code, status.HTTP_200_OK)
        self.assertEqual(notif_res.data['unread_count'], 2)
        types = {n['notif_type'] for n in notif_res.data['results']}
        self.assertIn('waitlist', types)
        self.assertIn('comment', types)

        # Mark all as read
        mark_res = self.client.post('/api/notifications/mark-read/', {}, format='json')
        self.assertEqual(mark_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mark_res.data['unread_count'], 0)

    def test_history_invalid_query_params_return_400(self):
        self.client.force_authenticate(user=self.staff_user)
        res_book = self.client.get('/api/borrowings/history/?book_id=abc')
        self.assertEqual(res_book.status_code, status.HTTP_400_BAD_REQUEST)
        res_user = self.client.get('/api/borrowings/history/?user_id=xyz')
        self.assertEqual(res_user.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quick_borrow_rejects_invalid_days(self):
        self.client.force_authenticate(user=self.staff_user)
        for bad_days in (-5, 0, 500, 'abc', True):
            res = self.client.post('/api/manager/quick-borrow/', {
                'user_identifier': self.other_user.username,
                'book_identifier': str(self.book.id),
                'days': bad_days,
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.book.refresh_from_db()
            self.assertTrue(self.book.is_available)

    def test_cannot_delete_book_with_active_borrowing(self):
        self.client.force_authenticate(user=self.other_user)
        borrow_res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(borrow_res.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.user)
        del_res = self.client.delete(f'/api/books/{self.book.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Book.objects.filter(id=self.book.id).exists())

    def test_overdue_reminder_recreated_on_reborrow(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import Notification

        self.client.force_authenticate(user=self.other_user)
        b1 = self.client.post(f'/api/books/{self.book.id}/borrow/').data['borrowing']['id']
        Borrowing.objects.filter(id=b1).update(
            borrow_date=timezone.now() - timedelta(days=20),
            due_date=timezone.now() - timedelta(days=5),
        )
        loan1 = Borrowing.objects.get(id=b1)
        self.client.get('/api/notifications/')
        self.assertEqual(
            Notification.objects.filter(user=self.other_user, notif_type='reminder').count(),
            1
        )
        Notification.objects.filter(user=self.other_user, notif_type='reminder').update(
            created_at=loan1.borrow_date + timedelta(days=15)
        )
        self.client.post(f'/api/borrowings/{b1}/return/')

        b2 = self.client.post(f'/api/books/{self.book.id}/borrow/').data['borrowing']['id']
        Borrowing.objects.filter(id=b2).update(
            borrow_date=timezone.now() - timedelta(days=1),
            due_date=timezone.now() - timedelta(hours=2),
        )
        loan2 = Borrowing.objects.get(id=b2)
        self.client.get('/api/notifications/')
        self.assertEqual(
            Notification.objects.filter(user=self.other_user, notif_type='reminder').count(),
            2
        )
        self.assertGreaterEqual(loan2.borrow_date, loan1.borrow_date)

    def test_multi_copy_book_lifecycle_and_management(self):
        self.client.force_authenticate(user=self.user)
        create_res = self.client.post('/api/books/', {
            'title': 'کلیدر',
            'author': 'محمود دولت‌آبادی',
            'description': 'رمان ده‌جلدی',
            'price': '45.00',
            'copies_count': 2,
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        book_id = create_res.data['id']
        self.assertEqual(create_res.data['total_copies_count'], 2)
        self.assertEqual(create_res.data['available_copies_count'], 2)
        copy_ids = [c['id'] for c in create_res.data['copies']]
        self.assertEqual(len(copy_ids), 2)
        self.assertNotEqual(copy_ids[0], copy_ids[1])

        # User 1 borrows copy #1 -> book still has 1 available copy, so is_available remains True
        self.client.force_authenticate(user=self.user)
        b1 = self.client.post(f'/api/books/{book_id}/borrow/')
        self.assertEqual(b1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(b1.data['borrowing']['copy_id'], copy_ids[0])
        book_obj = Book.objects.get(id=book_id)
        self.assertTrue(book_obj.is_available)

        # User 1 cannot borrow a second copy of the same book simultaneously
        b1_dup = self.client.post(f'/api/books/{book_id}/borrow/')
        self.assertEqual(b1_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # User 2 borrows copy #2 via Staff Quick Borrow using explicit COPY:<id>
        self.client.force_authenticate(user=self.staff_user)
        b2 = self.client.post('/api/manager/quick-borrow/', {
            'user_identifier': self.other_user.username,
            'book_identifier': f'COPY:{copy_ids[1]}',
            'days': 10,
        }, format='json')
        self.assertEqual(b2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(b2.data['borrowing']['copy_id'], copy_ids[1])
        book_obj.refresh_from_db()
        self.assertFalse(book_obj.is_available)

        detail_both = self.client.get(f'/api/books/{book_id}/')
        self.assertEqual(detail_both.data['current_borrower'], f'{self.user.username}، {self.other_user.username}')

        # Adding a 3rd copy makes the book available again
        add_copy_res = self.client.post(f'/api/books/{book_id}/copies/', {'count': 1}, format='json')
        self.assertEqual(add_copy_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(add_copy_res.data['total_copies_count'], 3)
        self.assertEqual(add_copy_res.data['available_copies_count'], 1)
        self.assertTrue(add_copy_res.data['is_available'])
        third_copy_id = add_copy_res.data['created_copies'][0]['id']

        # Cannot delete a borrowed copy (copy_ids[0])
        del_borrowed = self.client.delete(f'/api/books/{book_id}/copies/{copy_ids[0]}/')
        self.assertEqual(del_borrowed.status_code, status.HTTP_400_BAD_REQUEST)

        # Can delete the available 3rd copy
        del_avail = self.client.delete(f'/api/books/{book_id}/copies/{third_copy_id}/')
        self.assertEqual(del_avail.status_code, status.HTTP_200_OK)
        self.assertEqual(del_avail.data['total_copies_count'], 2)
        self.assertEqual(del_avail.data['available_copies_count'], 0)
        self.assertFalse(del_avail.data['is_available'])

        # Returning copy #1 makes book available again
        borrowing1_id = b1.data['borrowing']['id']
        ret_res = self.client.post(f'/api/borrowings/{borrowing1_id}/return/')
        self.assertEqual(ret_res.status_code, status.HTTP_200_OK)
        book_obj.refresh_from_db()
        self.assertTrue(book_obj.is_available)

    def test_multi_copy_security_validation_history_and_waitlist(self):
        # 1. Strict integer validation for BookCopyCreateAPIView
        self.client.force_authenticate(user=self.staff_user)
        for bad_count in (True, False, 1.9, '1.5', 0, 51):
            bad_res = self.client.post(f'/api/books/{self.book.id}/copies/', {'count': bad_count}, format='json')
            self.assertEqual(bad_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Borrow sole copy, add user to waitlist, then add a new copy -> waitlist must be notified
        self.client.force_authenticate(user=self.other_user)
        b_res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(b_res.status_code, status.HTTP_201_CREATED)
        first_copy_id = b_res.data['borrowing']['copy_id']

        waiter = User.objects.create_user(username='waiter1', email='w1@example.com', password='password123')
        self.client.force_authenticate(user=waiter)
        wait_res = self.client.post(f'/api/books/{self.book.id}/reserve/')
        self.assertEqual(wait_res.status_code, status.HTTP_200_OK)

        # Anonymous and regular non-staff users must NOT see current_borrower or current_borrowing_id
        self.client.force_authenticate(user=None)
        anon_detail = self.client.get(f'/api/books/{self.book.id}/')
        self.assertIsNone(anon_detail.data['current_borrower'])
        self.assertIsNone(anon_detail.data['copies'][0]['current_borrower'])
        self.assertIsNone(anon_detail.data['copies'][0]['current_borrowing_id'])

        anon_list = self.client.get('/api/books/')
        self.assertIsNone(anon_list.data[0]['current_borrower'])
        self.assertIsNone(anon_list.data[0]['copies'][0]['current_borrower'])

        self.client.force_authenticate(user=waiter)
        reg_detail = self.client.get(f'/api/books/{self.book.id}/')
        self.assertIsNone(reg_detail.data['current_borrower'])
        self.assertIsNone(reg_detail.data['copies'][0]['current_borrower'])

        # Staff adds a new copy -> waiter receives a waitlist notification and staff stats show total_titles + total_books
        self.client.force_authenticate(user=self.staff_user)
        add_res = self.client.post(f'/api/books/{self.book.id}/copies/', {'count': 1}, format='json')
        self.assertEqual(add_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Notification.objects.filter(user=waiter, notif_type='waitlist').count(),
            1
        )
        stats_res = self.client.get('/api/manager/stats/')
        self.assertEqual(stats_res.status_code, status.HTTP_200_OK)
        self.assertEqual(stats_res.data['total_books'], 2)
        self.assertEqual(stats_res.data['total_titles'], 1)

        # 3. Return first copy, then delete that copy -> historical borrowing keeps copy_id and flags is_copy_deleted=True
        borrowing_id = b_res.data['borrowing']['id']
        self.client.post(f'/api/borrowings/{borrowing_id}/return/')
        del_copy_res = self.client.delete(f'/api/books/{self.book.id}/copies/{first_copy_id}/')
        self.assertEqual(del_copy_res.status_code, status.HTTP_200_OK)

        hist_res = self.client.get(f'/api/borrowings/history/?book_id={self.book.id}')
        self.assertEqual(hist_res.status_code, status.HTTP_200_OK)
        self.assertEqual(hist_res.data['results'][0]['copy_id'], first_copy_id)
        self.assertTrue(hist_res.data['results'][0]['is_copy_deleted'])

        # 4. Superuser deleting book creator (self.user) must NOT delete self.book or active borrowings of others
        self.client.force_authenticate(user=waiter)
        waiter_loan = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(waiter_loan.status_code, status.HTTP_201_CREATED)

        superuser = User.objects.create_superuser(username='root_admin', email='ra@example.com', password='password123')
        self.client.force_authenticate(user=superuser)
        del_owner = self.client.delete(f'/api/auth/users/{self.user.id}/')
        self.assertEqual(del_owner.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(Book.objects.filter(id=self.book.id).exists())
        self.book.refresh_from_db()
        self.assertIsNone(self.book.user)
        self.assertTrue(Borrowing.objects.filter(id=waiter_loan.data['borrowing']['id'], return_date__isnull=True).exists())








