from django.urls import path
from. import api_views

urlpatterns = [
    path("lessons/", api_views.LessonListView.as_view(), name="lesson-list"),
    # Mirror the quiz-path routing tolerance so learn progress reads/writes accept both URL forms during rollout.
    path("learn-progress", api_views.LearnProgressView.as_view(), name="learn-progress"),
    path("learn-progress/", api_views.LearnProgressView.as_view(), name="learn-progress-trailing"),
    path("learn-progress/<str:unit_external_id>/complete", api_views.LearnProgressCompleteView.as_view(), name="learn-progress-complete"),
    path("learn-progress/<str:unit_external_id>/complete/", api_views.LearnProgressCompleteView.as_view(), name="learn-progress-complete-trailing"),
    # Support both URL forms so frontend fetches stay tolerant while the new path route settles.
    path("quiz-path", api_views.QuizPathView.as_view(), name="quiz-path"),
    path("quiz-path/", api_views.QuizPathView.as_view(), name="quiz-path-trailing"),
    path("quizzes/<int:pk>/", api_views.QuizDetailView.as_view(), name="quiz-detail"),
    path("quizzes/<int:quiz_id>/feedback/", api_views.QuizFeedbackView.as_view(), name="quiz-feedback"),
    path("quizzes/<int:quiz_id>/submit/", api_views.SubmitQuizView.as_view(), name="quiz-submit"),
    path("v1/catalog", api_views.CatalogView.as_view(), name="catalog"),
    path("v1/catalog/", api_views.CatalogView.as_view(), name="catalog-trailing"),
    path("v1/quiz-catalog", api_views.QuizCatalogView.as_view(), name="quiz-catalog"),
    path("v1/quiz-catalog/", api_views.QuizCatalogView.as_view(), name="quiz-catalog-trailing"),
    path("v1/catalog/regenerate", api_views.CatalogRegenerateView.as_view(), name="catalog-regenerate"),
    path("v1/catalog/regenerate/", api_views.CatalogRegenerateView.as_view(), name="catalog-regenerate-trailing"),
    path("me/dashboard/", api_views.UserDashboardView.as_view(), name="user-dashboard"),
]
