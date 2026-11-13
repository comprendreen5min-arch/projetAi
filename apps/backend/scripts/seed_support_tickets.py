import io
import json
import random
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.services.parquet_service import parquet_service
from app.services.lineage_service import lineage_service


def seed_support_tickets():
    db = SessionLocal()
    dataset_name = "support_tickets.jsonl"
    existing = db.query(Dataset).filter(Dataset.name == dataset_name).first()
    if existing:
        print(f"Dataset '{dataset_name}' already exists.")
        return

    # Sample texts representing the template categories
    french_samples = [
        ("Bonjour, ma commande n'est pas arrivée. Appelez-moi au 06 12 34 56 78 svp.", "delivery", "fr"),
        ("Le produit est cassÃ© à la livraison, je veux un remboursement.", "refund", "fr"),
        ("Facture erronée reçue ce matin pour le prélèvement mensuel.", "billing", "fr"),
        ("Je n'arrive plus à me connecter à mon compte professionnel.", "account", "fr"),
        ("Le serveur renvoie une erreur 502 Bad Gateway depuis hier.", "technical", "fr"),
        ("Je souhaite déposer une réclamation concernant l'accueil téléphonique.", "complaint", "fr"),
        ("Autre question relative aux conditions générales d'utilisation.", "other", "fr"),
    ]
    english_samples = [
        ("Where is my refund? I asked three times already.", "refund", "en"),
        ("Please cancel my subscription and delete my credit card data.", "billing", "en"),
        ("Package tracking says delivered but I received nothing.", "delivery", "en"),
        ("API token expired and password reset email is not arriving.", "account", "en"),
    ]
    arabic_samples = [
        ("السلام عليكم، طلبيتي لم تصل بعد، المرجو المساعدة في أقرب وقت.", "delivery", "ar"),
        ("أريد استرجاع أموالي، الخدمة لم تكن في المستوى المطلوب.", "refund", "ar"),
    ]
    darija_samples = [
        ("Salam, l-commande diali mazal ma wslatsh, 3afakom 3aytoli.", "delivery", "darija"),
        ("L-application katbqa t-bloqui bzaf f l-khrif.", "technical", "darija"),
    ]

    all_samples = french_samples * 5 + arabic_samples * 2 + darija_samples * 2 + english_samples * 2
    
    rows = []
    # Generate 1,500 sample rows reflecting proportions
    for i in range(1500):
        t, cat, lang = random.choice(all_samples)
        rows.append({
            "ticket_id": f"TICK-{10000+i}",
            "text": t,
            "label": cat,
            "language": lang,
        })

    # Add a few broken encodings and PII
    rows[12]["text"] = "Le produit est cassÃ© à la livraison, je veux un remboursement."
    rows[45]["text"] = "Bonjour, ma commande n'est pas arrivée. Appelez-moi au 06 98 76 54 32 svp."
    rows[88]["text"] = "   " # empty text

    df = pd.DataFrame(rows)
    table = pa.Table.from_pandas(df)
    
    buf = io.BytesIO()
    pq.write_table(table, buf, compression="snappy")
    parquet_bytes = buf.getvalue()
    row_count = len(df)
    metadata = parquet_service.extract_table_metadata(table)

    dataset = Dataset(
        name=dataset_name,
        description="Corpus multilingue de tickets support client pour classification de texte (French, Arabic, Darija, English)",
    )
    db.add(dataset)
    db.flush()

    data_hash = parquet_service.calculate_bytes_hash(parquet_bytes)
    version_hash = lineage_service.generate_version_hash(
        dataset_id=dataset.id,
        parent_version_hash=None,
        transformation_name="JSONL_INGESTION",
        parameters={"filename": "support_tickets.jsonl", "format": "jsonl"},
        data_hash=data_hash,
    )

    storage_dir = Path("/app/storage/datasets") / str(dataset.id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    target_path = storage_dir / f"{version_hash}.parquet"
    target_path.write_bytes(parquet_bytes)

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_hash=version_hash,
        parent_version_id=None,
        storage_path=str(target_path),
        row_count=row_count,
        size_bytes=len(parquet_bytes),
        schema_metadata=metadata,
        is_draft=False,
    )
    db.add(version)
    db.flush()

    transformation = Transformation(
        target_version_id=version.id,
        name="JSONL_INGESTION",
        parameters={"filename": "support_tickets.jsonl", "format": "jsonl"},
        execution_time_ms=18,
    )
    db.add(transformation)

    dataset.current_version_id = version.id
    dataset.baseline_version_id = version.id
    db.commit()
    print(f"Successfully seeded '{dataset_name}' with ID {dataset.id}")


if __name__ == "__main__":
    seed_support_tickets()

