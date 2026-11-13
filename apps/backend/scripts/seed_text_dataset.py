import io
import os
import random
import uuid
import pandas as pd
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.services.parquet_service import parquet_service
from app.services.lineage_service import lineage_service
from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from pathlib import Path

# Seed data for NLP Customer Reviews
REVIEWS_TEMPLATES = [
    # Positifs (FR)
    ("Superbe expérience ! Le support technique a résolu mon problème en moins de 10 minutes. Je recommande vivement.", "positif", "support", "fr"),
    ("Interface très intuitive et performante. La vitesse de traitement des données est impressionnante.", "positif", "produit", "fr"),
    ("Très satisfait de mon abonnement annuel. Le rapport qualité/prix est excellent par rapport aux concurrents.", "positif", "facturation", "fr"),
    ("Livraison ultra rapide et produit parfaitement emballé. Bravo à toute l'équipe pour le sérieux !", "positif", "livraison", "fr"),
    ("Application fluide, claire et moderne. La dernière mise à jour apporte des fonctionnalités très utiles au quotidien.", "positif", "produit", "fr"),
    ("Service client exemplaire. L'agent a été courtois, professionnel et très patient avec mes questions.", "positif", "support", "fr"),

    # Neutres (FR)
    ("Produit conforme à la description, rien à signaler de particulier. Fait le travail sans fioritures.", "neutre", "produit", "fr"),
    ("Délai de livraison correct (4 jours). Le suivi du colis manquait un peu de précisions en temps réel.", "neutre", "livraison", "fr"),
    ("Tarif dans la moyenne du marché. L'offre de base est suffisante pour une petite structure.", "neutre", "facturation", "fr"),
    ("Quelques ralentissements constatés aux heures de pointe, mais globalement utilisable.", "neutre", "produit", "fr"),
    ("La facture a bien été reçue par email, mais le détail des taxes n'était pas très lisible au premier abord.", "neutre", "facturation", "fr"),

    # Négatifs (FR)
    ("Très déçu du service client. Aucun retour après trois relances pour mon ticket n°45892. Inacceptable !", "négatif", "support", "fr"),
    ("L'application plante systématiquement lors de l'export des fichiers volumineux. Merci de corriger ce bug critique.", "négatif", "produit", "fr"),
    ("Frais cachés non mentionnés lors de la souscription ! J'ai été prélevé de 29€ supplémentaires sans explication.", "négatif", "facturation", "fr"),
    ("Colis reçu avec deux semaines de retard et le carton était complètement déchiré. Très mauvaise expérience.", "négatif", "livraison", "fr"),
    ("Impossible de réinitialiser mon mot de passe. Le lien reçu est systématiquement expiré. C'est très frustrant.", "négatif", "support", "fr"),

    # EN Reviews
    ("Great platform! The onboarding tutorial was seamless and our team was up and running in just an afternoon.", "positif", "produit", "en"),
    ("Customer support went above and beyond to fix our billing discrepancy. Highly professional staff.", "positif", "support", "en"),
    ("Average experience overall. Some features feel a bit clunky on mobile devices.", "neutre", "produit", "en"),
    ("Frequent server timeouts during peak hours. Our automated pipeline keeps failing because of this.", "négatif", "produit", "en"),
    ("Billing dashboard is confusing and the invoice export fails with a 500 error every month.", "négatif", "facturation", "en"),

    # PII Examples (FR/EN)
    ("Veuillez me recontacter d'urgence à jean.dupont75@gmail.com ou au 06 12 34 56 78 pour finaliser la commande.", "neutre", "support", "fr"),
    ("Merci de modifier mon adresse de facturation pour contact@entreprise-consulting.fr dès que possible.", "neutre", "facturation", "fr"),
    ("Please call our tech lead at +33 7 89 01 23 45 or reach out to support-admin@globalcorp.io regarding account migration.", "neutre", "support", "en"),
    ("J'ai transmis mes coordonnées par erreur : marc.lefevre@yahoo.fr / 0698765432. Pouvez-vous les supprimer des logs ?", "négatif", "support", "fr"),

    # HTML / Bruit textuel
    ("<b>Alerte importante</b> : le formulaire de paiement refuse les cartes Visa. <p>Erreur HTTP 403 récurrente.</p>", "négatif", "facturation", "fr"),
    ("Le design est <span style='color:red;'>très réussi</span> mais la barre de navigation cache certains boutons.", "neutre", "produit", "fr"),
    ("Service impeccable &amp; réactif ! &quot;Cinq étoiles&quot; bien méritées pour cette prestation.", "positif", "support", "fr"),

    # Textes trop courts ou atypiques
    ("Bien.", "positif", "produit", "fr"),
    ("Nul.", "négatif", "produit", "fr"),
    ("RAS", "neutre", "produit", "fr"),
    ("Ok", "neutre", "produit", "fr"),
    ("Test 123", "neutre", "produit", "fr"),
]

def generate_text_dataset(num_rows: int = 1250) -> pd.DataFrame:
    random.seed(42)
    rows = []
    
    for i in range(num_rows):
        doc_id = f"DOC-{i+1:05d}"
        template, sentiment, category, lang = random.choice(REVIEWS_TEMPLATES)
        
        # Introduce duplicates occasionally (e.g. 3% duplicates)
        if i > 50 and random.random() < 0.03:
            prev_row = rows[random.randint(0, i - 1)]
            text = prev_row["text"]
            sentiment = prev_row["sentiment"]
            category = prev_row["category"]
            lang = prev_row["language"]
        else:
            text = template
            # add minor natural variation
            if random.random() < 0.2:
                prefixes = ["En résumé : ", "Franchement, ", "Mon avis : ", "Note : "]
                text = random.choice(prefixes) + text
        
        rating = 5 if sentiment == "positif" else (1 if sentiment == "négatif" else 3)
        if random.random() < 0.15:
            rating = max(1, min(5, rating + random.choice([-1, 1])))

        rows.append({
            "doc_id": doc_id,
            "text": text,
            "sentiment": sentiment,
            "category": category,
            "language": lang,
            "rating": rating,
        })

    return pd.DataFrame(rows)


def seed():
    db = SessionLocal()
    dataset_name = "customer_reviews_nlp"
    existing = db.query(Dataset).filter(Dataset.name == dataset_name).first()
    if existing:
        print(f"Dataset '{dataset_name}' already exists with ID: {existing.id}")
        return

    df = generate_text_dataset(1250)
    csv_bytes = df.to_csv(index=False, encoding="utf-8").encode("utf-8")
    
    parquet_bytes, metadata, row_count = parquet_service.convert_csv_to_parquet_bytes(csv_bytes)
    
    dataset = Dataset(
        name=dataset_name,
        description="Corpus d'avis clients et tickets support pour NLP (classification de sentiment, détection PII, filtrage)",
    )
    db.add(dataset)
    db.flush()

    data_hash = parquet_service.calculate_bytes_hash(parquet_bytes)
    version_hash = lineage_service.generate_version_hash(
        dataset_id=dataset.id,
        parent_version_hash=None,
        transformation_name="CSV_INGESTION",
        parameters={"filename": "customer_reviews.csv", "format": "text"},
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
        name="CSV_INGESTION",
        parameters={"filename": "customer_reviews.csv", "format": "text"},
        execution_time_ms=12,
    )
    db.add(transformation)

    dataset.current_version_id = version.id
    dataset.baseline_version_id = version.id
    db.commit()
    print(f"Successfully seeded '{dataset_name}' with ID {dataset.id} and version #{version_hash[:8]}")


if __name__ == "__main__":
    seed()
