from fastapi import APIRouter
from app.api.v1.endpoints import datasets, versions, transformations, cleaning, augmentation, labeling, training

api_router = APIRouter()

api_router.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])
api_router.include_router(versions.router, prefix="/versions", tags=["Versions"])
api_router.include_router(transformations.router, prefix="/transformations", tags=["Transformations"])
api_router.include_router(cleaning.router, prefix="/cleaning", tags=["Cleaning"])
api_router.include_router(augmentation.router, prefix="/augmentation", tags=["Augmentation"])
api_router.include_router(labeling.router, prefix="/labeling", tags=["Labeling"])
api_router.include_router(training.router, prefix="/training", tags=["Training"])


