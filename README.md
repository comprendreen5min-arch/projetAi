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
| `GET` | `/api/v1/versions/{version_hash}/profile` | Profil statistique complet d'une version (mis en cache) |
| `PUT` | `/api/v1/versions/{version_hash}/target` | Définir et mémoriser la colonne cible d'une version |
| `POST` | `/api/v1/cleaning/{version_hash}/preview` | Simuler un lot d'opérations de nettoyage (lignes touchées, diffs, avertissements) |
| `POST` | `/api/v1/cleaning/{version_hash}/apply` | Appliquer les opérations, créer la version immuable et retourner l'évolution du score |
| `GET` | `/api/v1/cleaning/{version_hash}/categories` | Lister les catégories uniques d'une colonne avec décomptes |

---

## 📊 Module 01 : Profiling & Score de Santé IA

Le module de profilage analyse en profondeur les caractéristiques structurelles, statistiques et de qualité de chaque version de dataset sans jamais recourir à des données simulées.

### 1. Formules Mathématiques des 5 Sous-Scores (sur 100)

Chaque sous-score est un indicateur objectif normalisé sur l'échelle 0 à 100 :

1. **Complétude ($S_{\text{complétude}}$, Poids : 25%)** :
   Mesure l'exhaustivité des cellules renseignées dans l'ensemble de la table :
   $$S_{\text{complétude}} = 100 \times \left(1 - \frac{\sum_{j=1}^M \text{nulls}_j}{N \times M}\right)$$
   *(où $N$ est le nombre de lignes et $M$ le nombre de colonnes)*

2. **Unicité ($S_{\text{unicité}}$, Poids : 20%)** :
   Mesure l'absence de redondance stricte de lignes :
   $$S_{\text{unicité}} = 100 \times \left(1 - \frac{\text{nb\_lignes\_dupliquées}}{N}\right)$$

3. **Validité ($S_{\text{validité}}$, Poids : 20%)** :
   Mesure la proportion de colonnes exemptes d'anomalies critiques (taux d'absence élevé $>10\%$ ou présence de valeurs aberrantes hors clôtures de Tukey IQR) :
   $$S_{\text{validité}} = 100 \times \left(1 - \frac{\text{nb\_colonnes\_avec\_anomalies}}{M}\right)$$

4. **Cohérence ($S_{\text{cohérence}}$, Poids : 20%)** :
   Mesure l'homogénéité orthographique et syntaxique des variables catégorielles. Une incohérence est détectée lorsque plusieurs modalités diffèrent uniquement par la casse, des espaces superflus ou des accents (ex. `["Casablanca", "casa", "CASABLANCA"]`) :
   $$S_{\text{cohérence}} = 100 \times \left(1 - \frac{\text{nb\_colonnes\_catégorielles\_incohérentes}}{\text{nb\_colonnes\_catégorielles}}\right)$$
   *(Vaut 100% si le jeu de données ne possède pas de colonnes catégorielles)*

5. **Équilibre des classes ($S_{\text{équilibre}}$, Poids : 15%)** :
   Mesuré via l'**Entropie de Shannon normalisée** de la variable cible discrète sélectionnée ($K \ge 2$ classes, fréquences empiriques $p_1, \dots, p_K$) :
   $$S_{\text{équilibre}} = 100 \times \frac{-\sum_{k=1}^K p_k \log(p_k)}{\log(K)}$$
   - Vaut 100% lorsque toutes les classes sont parfaitement équilibrées ($p_k = 1/K$).
   - Vaut 41% pour une distribution binaire à 8% / 92% (comme dans le cas churn).
   - Vaut 0% si une seule classe existe.
   - **État vide (`—`)** : Si aucune colonne cible n'a encore été sélectionnée par l'utilisateur ou si la colonne sélectionnée est continue/numérique sans catégories finies, ce score n'est pas calculé arbitrairement.

### 2. Score de Santé Global (Health Score / 100)

Le score de santé global est la moyenne pondérée dynamique des sous-scores calculables :
$$\text{Health Score} = \text{round}\left(\frac{\sum_{i \in \text{actifs}} w_i \times S_i}{\sum_{i \in \text{actifs}} w_i}\right)$$
- Lorsque la cible est définie : $\sum w_i = 0.25 + 0.20 + 0.20 + 0.20 + 0.15 = 1.0$.
- Lorsque la cible n'est pas définie : renormalisation automatique sur la somme des poids restants ($0.85$), sans inventer de valeur.

### 3. Seuils de Gravité des Détections (« Ce qui demande votre attention »)

Les anomalies sont catégorisées et triées par niveau d'impact :

| Niveau | Règle / Seuil de Détection | Action Suggérée (Prévue pour Cleaning) |
| :--- | :--- | :--- |
| **`HIGH`** | • Déséquilibre de classe sévère : classe minoritaire $< 15\%$ ou entropie normalisée $< 50\%$<br>• Données manquantes critiques : colonne avec $> 10\%$ de valeurs nulles | `See options →` (Rééquilibrage / SMOTE)<br>`Fix →` (Imputation de valeurs) |
| **`MEDIUM`** | • Valeurs aberrantes (outliers) : données en dehors des clôtures $[Q_1 - 1.5\text{IQR}, Q_3 + 1.5\text{IQR}]$<br>• Catégories incohérentes : collision de minuscules/majuscules/accents/espaces<br>• Données manquantes modérées : colonnes avec $0 < \text{nulls} \le 10\%$ | `Review →` (Inspection & bornage)<br>`Merge →` (Fusion de catégories)<br>`Fix →` (Imputation) |
| **`LOW`** | • Lignes dupliquées : présence d'au moins une ligne doublon stricte ($> 0$)<br>• Déséquilibre léger : classe minoritaire entre $15\%$ et $35\%$ | `Remove →` (Déduplication)<br>`Review →` (Vérification) |

---

---

## 🧹 Module 02 : Nettoyage Déterministe & Immuabilité (Cleaning)

Le module de nettoyage applique un ensemble d'opérations d'assainissement tout en préservant l'immuabilité et la reproductibilité mathématique stricte.

### 1. Ordre d'Exécution Fixe et Déterministe d'un Lot d'Opérations
Lorsqu'un lot d'opérations est soumis (ou accumulé dans la file d'attente), le moteur backend le trie selon un ordre déterministe invariable :
1. **Normalisation des Textes (`TEXT_NORMALIZE`)** : passage en minuscules, suppression des espaces superflus (strip) et retrait des accents (diacritiques Unicode).
2. **Fusion Manuelle des Catégories (`CATEGORY_MERGE`)** : regroupement de libellés vers une modalité cible (ex: `casa` $\rightarrow$ `casablanca`), s'exécutant sur les valeurs déjà normalisées.
3. **Traitement des Valeurs Manquantes (`HANDLE_MISSING`)** :
   - Suppression des lignes (`drop`)
   - Imputation statistique : moyenne (`mean`), médiane (`median`) — *strictement réservées aux colonnes numériques*
   - Imputation catégorielle : mode / modalité la plus fréquente (`mode`), ou valeur fixe (`constant`)
4. **Traitement des Valeurs Aberrantes (`HANDLE_OUTLIERS`)** :
   - Basé sur les clôtures de Tukey IQR : $[Q_1 - 1.5\text{IQR}, Q_3 + 1.5\text{IQR}]$
   - Plafonnement aux bornes (`clip`), suppression (`drop`) ou conservation (`keep`)
5. **Suppression des Doublons Stricts (`DROP_DUPLICATES`)** en dernier :
   - Définition stricte : ligne identique sur l'intégralité des colonnes
   - Conservation de la première (`first`) ou de la dernière (`last`) occurrence

### 2. Calcul Déterministe du Hash Logique
Le hash de la nouvelle version ne dépend **jamais des octets bruts du fichier Parquet** (qui peuvent varier selon l'horodatage ou la compression de la bibliothèque), mais du contenu logique strict :
$$\text{data\_hash} = \text{SHA256}(\text{Canonical CSV format}(df\text{ ordonné}))$$
$$\text{version\_hash} = \text{SHA256}(\text{parent\_hash} + \text{opérations\_et\_paramètres\_calculés} + \text{data\_hash})$$

Les paramètres stockés dans la table `Transformation` contiennent les **valeurs exactes calculées lors de l'exécution** (médiane précise utilisée, bornes IQR numériques appliquées, mapping effectif, etc.).

### 3. Règles d'Intégrité
- **Écriture Atomique** : le fichier Parquet physique, la ligne `DatasetVersion` et l'enregistrement `Transformation` sont validés ensemble en base de données ou annulés intégralement en cas d'erreur.
- **Protection de la Colonne Cible** : si une opération modifie la distribution des classes de la colonne cible (par suppression de lignes), un avertissement explicite est levé et la confirmation `confirm_target_modification=True` est requise.
- **Détection No-Op** : si un lot d'opérations n'altère aucune ligne (0 modification), aucune nouvelle version n'est créée et l'utilisateur en est averti.
- **Précalcul du Profil** : le profil statistique et les scores de santé de chaque nouvelle version sont calculés et enregistrés dès sa création pour un affichage instantané.

---

## 🔬 Module 03 : Augmentation & Équilibrage Stratifié (Augmentation)

Le module d'augmentation permet de découper et d'enrichir le jeu de données pour l'apprentissage machine, dans le respect rigoureux de l'étanchéité des données et de la reproductibilité.

### 1. Découpage Stratifié & Groupé (Split First)
- **Principe fondamental** : Seul le sous-ensemble **Train** est augmenté ou rééchantillonné. Les sous-ensembles **Validation** et **Test** restent **100 % réels, intacts et verrouillés**.
- **Stratification** : Réalisée sur la variable cible pour préserver les proportions exactes des classes dans chaque partition.
- **Groupement (`group_by`)** : Permet de grouper par une clé métier (ex. `customer_id`) pour éviter toute fuite de données d'un même individu entre le train et le test. Les ratios réels obtenus sont affichés, et le split est refusé si une partition contient moins de 3 exemples de la classe rare.
- **Ajout de la colonne `split`** : Chaque ligne est étiquetée avec `train`, `val` ou `test`.

### 2. Équilibrage de la Cible & Plafond Synthétique
- **Objectifs de part de la classe rare** : `Garder`, `20 %`, `30 %`, `50 %`.
- **Plafond strict de 50 % de synthétiques par classe** :
  Le nombre de lignes synthétiques générées ne peut jamais dépasser le nombre d'exemples réels existants de cette classe :
  $$N_{\text{synth}} \le N_{\text{min\_real}}$$
- **Sous-échantillonnage de la majorité** :
  Si l'objectif souhaité (ex. 30 % ou 50 %) n'est pas encore atteint après avoir atteint le plafond de 50 % de synthétiques, la classe majoritaire est sous-échantillonnée aléatoirement avec une graine fixe jusqu'à atteindre le ratio exact.

### 3. Techniques d'Augmentation Déterministes
- **SMOTE-NC Natif & Traçabilité des Parents** :
  - Recherche des $k$ plus proches voisins sur le sous-ensemble de la classe rare du **Train uniquement**.
  - Standardisation (`StandardScaler`) des variables numériques pour le calcul des distances euclidiennes, mais **interpolation sur les valeurs brutes d'origine**.
  - Les modalités catégorielles sont choisies parmi les voisins réels, garantissant qu'aucune modalité inconnue n'est inventée.
  - Chaque ligne générée porte : `is_synthetic = True`, `origin = "smote"`, et `parent_ids = "ID1 + ID2"` listant les 2 clients parents réels.
  - Nouvel identifiant synthétique généré (ex. `SYN-000123`).
  - Refus immédiat avec message clair si le jeu contient des valeurs manquantes non nettoyées ou si la classe rare a moins de $k+1$ exemples.
- **Traitement des Dates** :
  1. Détection automatique des colonnes de type date/datetime.
  2. Conversion temporaire en timestamps numériques Unix (secondes).
  3. Interpolation linéaire : $t_{\text{syn}} = t_1 + \lambda (t_2 - t_1)$.
  4. Reconversion dans le format d'origine (datetime ou chaîne ISO).
  5. En cas de date parent invalide, conservation de la date du parent dominant.
- **Bruit Léger sur Numériques** :
  - Jitter gaussien $\mathcal{N}(0, (\text{force}\% \times \sigma)^2)$ appliqué uniquement aux lignes synthétiques générées.
  - Bornage strict aux $[\min_{\text{obs}}, \max_{\text{obs}}]$ observés sur le Train, et conservation stricte du type entier.
- **Poids de Classes** :
  - Calcul des poids inversement proportionnels aux fréquences de classes sans modifier les données, enregistrés dans la recette pour l'étape Training.

### 4. Formule du Score d'Équilibre de la Cible
Le score d'équilibre de la cible sur le Train est calculé à l'aide de l'**Entropie normalisée de Shannon** (base $K$, où $K$ est le nombre de classes de la cible) :
$$H = -\sum_{i=1}^K p_i \ln(p_i) \quad \implies \quad \text{Score} = \text{round}\left(\frac{H}{\ln(K)} \times 100\right)$$
Ce score vaut $100$ pour une répartition parfaitement uniforme et tend vers $0$ en cas de déséquilibre extrême.

### 5. Les 6 Guardrails d'Intégrité Vérifiés Avant Enregistrement
1. **Jeu de test et validation jamais augmentés** : Tailles identiques avant/après, 0 ligne synthétique dans Val/Test, aucune ligne du train dupliquée dans le test.
2. **Plafond max 50 % de synthétiques par classe** : $N_{\text{synth}} \le N_{\text{min\_real}}$.
3. **Tag d'origine et parents sur chaque ligne générée** : `origin = smote`, `parent_ids` valide.
4. **Validité des catégories (invariants)** : Toutes les catégories générées appartiennent au domaine des catégories réelles observées.
5. **Parents de SMOTE-NC issus uniquement du Train** : Tous les voisins et parents appartiennent au split Train.
6. **Pas de double correction** : Exclusion mutuelle stricte entre rééchantillonnage (SMOTE/sous-échantillonnage) et poids de classes.

### 6. Exclusion des Métadonnées d'Augmentation
Les colonnes `split`, `is_synthetic`, `origin` et `parent_ids` sont strictement des métadonnées de lignage : elles sont exclues des variables prédictives (features), du score de santé de profilage et du futur entraînement.

### 7. Comparaison des Performances (« Est-ce que ça aide ? »)
Le module intègre un banc d'essai pour évaluer l'impact réel de l'augmentation :
- **Lignes de référence (Sans)** : utilise les lignes réelles du sous-ensemble Train de la version (`split = train` et `is_synthetic = false`), sans refaire de nouveau découpage.
- **Lignes augmentées (Avec)** : utilise l'ensemble du Train de la version (`split = train`), intégrant les lignes générées et le sous-échantillonnage éventuel.
- **Évaluation étanche** : les deux modèles sont évalués exclusivement sur le même jeu de test réel (`split = test`), avec un pré-traitement (imputation, standardisation, one-hot encoding) ajusté uniquement sur le Train respectif.
- **Répétition sur 5 graines aléatoires** : l'expérience est répétée sur 5 graines ($42, 43, 44, 45, 46$) pour fournir la moyenne et l'écart-type sur le Rappel, la Précision et le score F1 de la classe rare.
- **Signalement statistique** : affichage du nombre de positifs dans le jeu de test et mention explicite que sur un petit jeu de test les écarts peuvent être attribuables aux aléas d'échantillonnage.
- **Bouton « Envoyer la recette à Training »** : présent et verrouillé avec la mention « Disponible à l'étape Training ».

---

## 🔒 Immuabilité & Reproductibilité

Chaque version est scellée par son hash cryptographique. Si une transformation est relancée avec les mêmes données d'entrée et les mêmes paramètres, le système calcule le même hash et garantit la déduplication et l'exactitude des expérimentations d'apprentissage automatique.
