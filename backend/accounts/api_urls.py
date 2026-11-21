from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .api_views import (
    ChangePasswordAPIView,
    LoginAPIView,
    RegisterAPIView,
    SuperuserUserDetailAPIView,
    SuperuserUserListCreateAPIView,
    UserProfileAPIView,
)

app_name = 'accounts_api'

urlpatterns = [
    path('register/', RegisterAPIView.as_view(), name='api_register'),
    path('login/', LoginAPIView.as_view(), name='api_token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='api_token_refresh'),
    path('profile/', UserProfileAPIView.as_view(), name='api_profile'),
    path('change-password/', ChangePasswordAPIView.as_view(), name='api_change_password'),
    path('users/', SuperuserUserListCreateAPIView.as_view(), name='api_superuser_users'),
    path('users/<int:pk>/', SuperuserUserDetailAPIView.as_view(), name='api_superuser_user_detail'),
]
