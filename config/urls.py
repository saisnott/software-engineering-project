
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from pages.views import HomePageView

urlpatterns = [
    path('admin/', admin.site.urls),
    # REST API endpoints
    path('api/auth/', include('accounts.api_urls')),
    path('api/', include('books.api_urls')),
    # Legacy Django templates routes
    path('accounts/', include('django.contrib.auth.urls')),
    path('accounts/', include('accounts.urls')),
    path('', HomePageView.as_view(), name='home'),
    path('books/', include('books.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

