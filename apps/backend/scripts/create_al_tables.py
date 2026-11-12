import sys
sys.path.insert(0, '/app')

from app.core.database import engine, Base
from app.models import ActiveLearningRound

def create():
    print("Creating active learning tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")

if __name__ == '__main__':
    create()

