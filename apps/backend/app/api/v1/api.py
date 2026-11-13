from fastapi import APIRouter
from app.api.v1.endpoints import (
    datasets, versions, transformations, cleaning, augmentation,
    labeling, training, active_learning, drift, export_api,
    text_profiling, text_cleaning, text_augmentation, image_profiling, image_cleaning
)

api_router = APIRouter()

api_router.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])
api_router.include_router(versions.router, prefix="/versions", tags=["Versions"])
api_router.include_router(transformations.router, prefix="/transformations", tags=["Transformations"])
api_router.include_router(cleaning.router, prefix="/cleaning", tags=["Cleaning"])
api_router.include_router(augmentation.router, prefix="/augmentation", tags=["Augmentation"])
api_router.include_router(labeling.router, prefix="/labeling", tags=["Labeling"])
api_router.include_router(training.router, prefix="/training", tags=["Training"])
api_router.include_router(active_learning.router, prefix="/active-learning", tags=["Active Learning"])
api_router.include_router(drift.router, prefix="/drift", tags=["Drift"])
api_router.include_router(export_api.router, prefix="/export-api", tags=["Export API"])
api_router.include_router(text_profiling.router, prefix="/text-profiling", tags=["Text Profiling"])
api_router.include_router(text_cleaning.router, prefix="/text-cleaning", tags=["Text Cleaning"])
api_router.include_router(text_augmentation.router, prefix="/text-augmentation", tags=["Text Augmentation"])
api_router.include_router(image_profiling.router, prefix="/image-profiling", tags=["Image Profiling"])
api_router.include_router(image_cleaning.router, prefix="/image-cleaning", tags=["Image Cleaning"])



