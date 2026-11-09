# Datalift 🚀

> **Plateforme de gestion et de versioning immuable de données pour les équipes IA.**

Datalift est un monorepo moderne (FastAPI + React) conçu comme un *« Git pour la Data »*. Il permet d'ingérer des jeux de données tabulaires (CSV), de les convertir automatiquement en format colonnaire **Apache Parquet**, de tracer le lignage cryptographique (Merkle DAG) de chaque transformation et de garantir l'immuabilité absolue des versions via des hashes SHA-256.

---

## 🌟 Fonctionnalités Clés

- **Modèle de Données Immuable** :
  - `Dataset` : Conteneur logique d'un jeu de données.
  - `DatasetVersion` : Instantané physique en format Parquet identifié par un hash SHA-256 unique.
  - `Transformation` : Spécification déterministe reliant une version source à une version cible.
- **Ingestion & Moteur Parquet** :
  - Endpoint multipart pour upload de fichiers CSV (`/api/v1/datasets/{id}/upload` et `/api/v1/datasets/upload-raw`).
  - Conversion et compression en continu (`PyArrow` avec Snappy).
  - Extraction automatique du schéma, des types et comptage des lignes.
  - Calcul déterministe du hash de version :
    $$\text{version\_hash} = \text{SHA256}(\text{parent\_hash} + \text{transformation\_spec} + \text{data\_hash})$$
- **Lineage & Reproductibilité** :
  - Traçabilité complète de l'historique des transformations (`FILTER_QUERY`, `SELECT_COLUMNS`, `DROP_NULLS`).
- **Tests Automatisés** :
  - Suite de tests unitaires et d'intégration avec `pytest` couvrant la conversion Parquet, l'immuabilité du hash et l'ensemble de l'API REST.
- **Frontend React Moderne** :
  - Dashboard interactif (Vite + TypeScript + Lucide Icons).
  - Modal d'upload CSV en glisser-déposer.
  - Arbre de lineage et historique des versions.
  - Inspecteur de schéma et aperçu tabulaire des premières lignes d'un fichier Parquet.
  - Téléchargement direct des artefacts `.parquet`.

---

## 🏗️ Structure du Monorepo

```
projetAi/
├── apps/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── api/v1/
│   │   │   │   ├── endpoints/
│   │   │   │   │   ├── datasets.py        # Endpoints création, listing, upload CSV
│   │   │   │   │   ├── versions.py        # Endpoints listing, inspection schéma, download
│   │   │   │   │   └── transformations.py # Application d'opérations et lignage
│   │   │   │   └── api.py
│   │   │   ├── core/
│   │   │   │   ├── config.py              # Configuration Pydantic Settings
│   │   │   │   └── database.py            # Moteur SQLAlchemy (PostgreSQL / SQLite)
│   │   │   ├── models/                    # Modèles SQLAlchemy (Dataset, DatasetVersion, Transformation)
│   │   │   ├── schemas/                   # Schémas Pydantic V2
│   │   │   ├── services/
│   │   │   │   ├── parquet_service.py     # Conversion PyArrow CSV -> Parquet, lecture d'échantillons
│   │   │   │   ├── lineage_service.py     # Calcul cryptographique de l'arbre de hash
│   │   │   │   └── storage_service.py     # Gestion du stockage local/volume
│   │   │   └── main.py                    # Point d'entrée FastAPI & middleware CORS
│   │   ├── tests/
│   │   │   ├── conftest.py                # Base de test in-memory SQLite & fixtures
│   │   │   ├── test_parquet.py            # Tests de conversion et sérialisation Parquet
│   │   │   ├── test_lineage.py            # Tests d'immuabilité et déterminisme des hashes
│   │   │   └── test_api.py                # Tests d'intégration API REST
│   │   ├── storage/datasets/              # Stockage des fichiers Parquet
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── Navbar.tsx
│       │   │   ├── DatasetList.tsx        # Catalogue des jeux de données
│       │   │   ├── UploadModal.tsx        # Drag & drop upload CSV -> Parquet
│       │   │   ├── VersionHistory.tsx     # Visualisation du DAG de versions
│       │   │   ├── DataPreviewModal.tsx   # Inspection schéma & sample rows
│       │   │   └── TransformationModal.tsx# Application de transformation
│       │   ├── services/api.ts            # Client HTTP Axios
│       │   ├── types/index.ts             # Typages TypeScript
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       ├── vite.config.ts
│       └── Dockerfile
│
├── docker-compose.yml                     # PostgreSQL 16 + Backend FastAPI + Frontend React
└── README.md
```

---

## 🚀 Démarrage Rapide

### Option 1 : En Local sans Docker (Recommandé sur Windows)

Le backend a été configuré avec un mode **Zero-Config SQLite par défaut** : vous n'avez pas besoin d'installer PostgreSQL ni Docker pour tester l'intégralité des fonctionnalités et de l'immuabilité !

#### Démarrage en 1 clic :
Double-cliquez simplement sur :
- **[`start-all.bat`](file:///c:/Users/pc/Documents/projetAi/start-all.bat)** : Lance automatiquement le Backend FastAPI et le Frontend React dans deux fenêtres séparées.

---

#### Ou manuellement via terminal :

**1. Lancer le Backend (FastAPI)** :
```powershell
cd apps\backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- **API Documentation interactive (Swagger)** : [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Healthcheck** : [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

*(Optionnel) Charger des données de test réalistes :*
```powershell
python scripts\seed_demo.py
```

**2. Lancer les Tests** :
```powershell
cd apps\backend
python -m pytest -v
```
*(ou double-cliquer sur [`run-tests.bat`](file:///c:/Users/pc/Documents/projetAi/run-tests.bat))*

**3. Lancer le Frontend (React + Vite)** :
```powershell
cd apps\frontend
npm install
npm run dev
```
- **Interface web React** : [http://localhost:5173](http://localhost:5173)

---

### Option 2 : Avec Docker Compose (Si Docker est installé ultérieurement)

```bash
docker compose up --build
```
- **Frontend** : [http://localhost:3000](http://localhost:3000)
- **API FastAPI** : [http://localhost:8000](http://localhost:8000)
- **PostgreSQL 16** : port `5432`

---

## 📡 Spécification de l'API REST

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Vérification de santé du backend |
| `POST` | `/api/v1/datasets/` | Créer un conteneur de dataset |
| `GET` | `/api/v1/datasets/` | Lister tous les datasets avec leur dernière version |
| `GET` | `/api/v1/datasets/{id}` | Détail d'un dataset et historique complet |
| `DELETE` | `/api/v1/datasets/{id}` | Supprimer un dataset |
| `POST` | `/api/v1/datasets/{id}/upload` | **Uploader un CSV, convertir en Parquet et créer la version immuable** |
| `POST` | `/api/v1/datasets/upload-raw` | Créer un dataset et uploader son premier CSV en une requête |
| `GET` | `/api/v1/versions/dataset/{id}` | Historique des versions d'un dataset |
| `GET` | `/api/v1/versions/hash/{hash}` | Détail d'une version, schéma et premières lignes échantillon |
| `GET` | `/api/v1/versions/download/{hash}` | Télécharger le fichier physique `.parquet` |
| `POST` | `/api/v1/transformations/apply/{source_id}` | Appliquer une transformation et dériver une nouvelle version |

---

## 🔒 Immuabilité & Reproductibilité

Chaque version est scellée par son hash cryptographique. Si une transformation est relancée avec les mêmes données d'entrée et les mêmes paramètres, le système calcule le même hash et garantit la déduplication et l'exactitude des expérimentations d'apprentissage automatique.
