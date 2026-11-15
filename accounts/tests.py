from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient
from books.models import Book, Borrowing


class SignupPageTests(TestCase):
    def test_signup_url_by_name(self):
        response = self.client.get(reverse('signup'))
        self.assertEqual(response.status_code, 200)

    def test_signup_url(self):
        response = self.client.get('/accounts/signup/')
        self.assertEqual(response.status_code, 200)

    def test_signup_form(self):
        user =get_user_model().objects.create_user('myusername','PASSWORD')
        self.assertEqual(get_user_model().objects.all().count(),1)
        self.assertEqual(user.username,'myusername')


class AccountSecurityAndIntegrityAPITests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username='rootadmin',
            email='root@example.com',
            password='password123',
            age=35,
        )
        self.member = User.objects.create_user(
            username='member1',
            email='member1@example.com',
            password='password123',
            age=22,
        )
        self.book = Book.objects.create(
            user=self.superuser,
            title='کتاب تست',
            author='نویسنده',
            description='توضیح',
            price=10.00,
            is_available=True,
        )

    def test_deleting_user_with_active_borrowing_frees_book(self):
        self.client.force_authenticate(user=self.member)
        borrow_res = self.client.post(f'/api/books/{self.book.id}/borrow/')
        self.assertEqual(borrow_res.status_code, status.HTTP_201_CREATED)
        self.book.refresh_from_db()
        self.assertFalse(self.book.is_available)

        self.client.force_authenticate(user=self.superuser)
        del_res = self.client.delete(f'/api/auth/users/{self.member.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.book.refresh_from_db()
        self.assertTrue(self.book.is_available)
        self.assertFalse(Borrowing.objects.filter(book=self.book, return_date__isnull=True).exists())

    def test_superuser_cannot_demote_or_deactivate_self_via_multipart_string(self):
        self.client.force_authenticate(user=self.superuser)
        res_super = self.client.patch(
            f'/api/auth/users/{self.superuser.id}/',
            {'is_superuser': 'false'},
            format='multipart',
        )
        self.assertEqual(res_super.status_code, status.HTTP_400_BAD_REQUEST)
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_superuser)

        res_active = self.client.patch(
            f'/api/auth/users/{self.superuser.id}/',
            {'is_active': 'false'},
            format='multipart',
        )
        self.assertEqual(res_active.status_code, status.HTTP_400_BAD_REQUEST)
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_active)

    def test_inactive_login_does_not_leak_status_with_wrong_password(self):
        self.member.is_active = False
        self.member.save()

        wrong_pw = self.client.post('/api/auth/login/', {
            'username': self.member.username,
            'password': 'totally_wrong_password',
        }, format='json')
        self.assertEqual(wrong_pw.status_code, status.HTTP_401_UNAUTHORIZED)

        right_pw = self.client.post('/api/auth/login/', {
            'username': self.member.username,
            'password': 'password123',
        }, format='json')
        self.assertEqual(right_pw.status_code, status.HTTP_403_FORBIDDEN)

    def test_age_validation_rejects_negative_and_out_of_range(self):
        reg_neg = self.client.post('/api/auth/register/', {
            'username': 'newuser_neg',
            'email': 'neg@example.com',
            'password': 'password123',
            'age': -10,
        }, format='json')
        self.assertEqual(reg_neg.status_code, status.HTTP_400_BAD_REQUEST)

        reg_high = self.client.post('/api/auth/register/', {
            'username': 'newuser_high',
            'email': 'high@example.com',
            'password': 'password123',
            'age': 150,
        }, format='json')
        self.assertEqual(reg_high.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.member)
        prof_neg = self.client.patch('/api/auth/profile/', {'age': 0}, format='json')
        self.assertEqual(prof_neg.status_code, status.HTTP_400_BAD_REQUEST)





