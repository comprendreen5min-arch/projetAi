import io
import pytest
from sqlalchemy.orm import Session
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.text_cleaning_service import text_cleaning_service
from app.services.storage_service import storage_service


def test_text_cleaning_template_recipe(db_session: Session):
    """
    Verifies that Text Cleaning on support_tickets.jsonl exactly matches Mockups 1 & 2:
    - 56,048 docs (was 58,300), 4 languages, 2,636 texts edited, output v2
    - Health score before 74 -> after 92
    - 6 steps in recipe with accurate parameter dropdowns, counts and labels
    - Previews for each step with before/after rows and language tags
    - Quality impact before/after percentages
    """
    dataset = Dataset(name="support_tickets.jsonl", description="Support tickets text dataset")
    db_session.add(dataset)
    db_session.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_hash="v1_raw_text_tickets",
        parent_version_id=None,
        storage_path="/app/storage/datasets/support_tickets.parquet",
        row_count=58300,
        size_bytes=int(41 * 1024 * 1024),
        is_draft=False,
    )
    db_session.add(version)
    dataset.current_version_id = version.id
    db_session.commit()

    recipe = text_cleaning_service.get_cleaning_recipe(str(dataset.id), db_session)

    # 1. Header KPIs
    assert recipe["kpis"]["documents"] == "56,048"
    assert recipe["kpis"]["documents_was"] == "was 58,300"
    assert recipe["kpis"]["languages"] == 4
    assert recipe["kpis"]["languages_detail"] == "fr · ar · darija · en"
    assert recipe["kpis"]["texts_edited"] == "2,636"
    assert recipe["kpis"]["texts_edited_pct"] == "4.5% of the corpus"
    assert recipe["kpis"]["output"] == "v2"

    # 2. Health Score
    assert recipe["health"]["before"] == 74
    assert recipe["health"]["after"] == 92

    # 3. Steps list
    assert len(recipe["steps"]) == 6
    steps_dict = {s["id"]: s for s in recipe["steps"]}

    s1 = steps_dict["mask_pii"]
    assert s1["rank"] == "01"
    assert "2,310" in s1["title"]
    assert s1["param_label"] == "REPLACE WITH"
    assert s1["param_value"] == "[PHONE] [EMAIL] [NAME]"
    assert s1["enabled"] is True

    s2 = steps_dict["repair_encoding"]
    assert s2["rank"] == "02"
    assert "96" in s2["subtitle"]
    assert s2["param_label"] == "METHOD"
    assert s2["param_value"] == "Re-decode · auto"

    s3 = steps_dict["remove_duplicates"]
    assert s3["rank"] == "03"
    assert "1,840" in s3["title"]
    assert s3["param_label"] == "KEEP"
    assert s3["param_value"] == "Earliest ticket"

    s4 = steps_dict["remove_empty"]
    assert s4["rank"] == "04"
    assert "412" in s4["title"]
    assert s4["param_label"] == "SIGNATURES"
    assert s4["param_value"] == "Strip, then check"

    s5 = steps_dict["split_long"]
    assert s5["rank"] == "05"
    assert "230" in s5["title"]
    assert s5["param_label"] == "CHUNK SIZE"
    assert s5["param_value"] == "512 tokens · 64 overlap"

    s6 = steps_dict["balance_labels"]
    assert s6["rank"] == "06"
    assert s6.get("is_later") is True
    assert s6["param_label"] == "HANDLED IN"
    assert s6["param_value"] == "03 Augmentation"

    # 4. Previews
    assert "mask_pii" in recipe["previews"]
    mask_preview = recipe["previews"]["mask_pii"]
    assert len(mask_preview["rows"]) == 3
    assert mask_preview["rows"][0]["highlight"] == "[PHONE]"
    assert mask_preview["rows"][1]["highlight"] == "[EMAIL]"
    assert mask_preview["rows"][2]["highlight"] == "[NAME]"
    assert "French, Arabic, Darija and English" in mask_preview["footnote"]

    # 5. Quality Impact
    qi = recipe["quality_impact"]
    assert qi["completeness"]["before"] == 99 and qi["completeness"]["after"] == 100
    assert qi["uniqueness"]["before"] == 97 and qi["uniqueness"]["after"] == 100
    assert qi["encoding"]["before"] == 95 and qi["encoding"]["after"] == 100
    assert qi["privacy"]["before"] == 52 and qi["privacy"]["after"] == 98
    assert qi["label_balance"]["value"] == 58


def test_text_cleaning_apply_recipe(db_session: Session, tmp_path):
    """
    Tests dynamic execution of text cleaning recipe:
    - Masks phone and email
    - Fixes broken characters
    - Removes empty texts and duplicates
    - Produces new DatasetVersion
    """
    # Create dataset with dirty text rows
    data = [
        {"id": 1, "text": "Appelez-moi au 06 12 34 56 78 svp", "category": "billing"},
        {"id": 2, "text": "Contactez contact@client.ma pour la facture", "category": "billing"},
        {"id": 3, "text": "Le colis est cassÃ©", "category": "delivery"},
        {"id": 4, "text": "Message en double", "category": "other"},
        {"id": 5, "text": "Message en double", "category": "other"},  # duplicate
        {"id": 6, "text": "   \n   ", "category": "other"},  # empty
    ]
    df = pd.DataFrame(data)
    parquet_path = tmp_path / "dirty_texts.parquet"
    table = pa.Table.from_pandas(df)
    pq.write_table(table, str(parquet_path))

    dataset = Dataset(name="custom_dirty_texts.txt", description="Dirty test texts")
    db_session.add(dataset)
    db_session.flush()

    v1 = DatasetVersion(
        dataset_id=dataset.id,
        version_hash="dirty_v1",
        storage_path=str(parquet_path),
        row_count=len(df),
        size_bytes=parquet_path.stat().st_size,
        is_draft=False,
    )
    db_session.add(v1)
    dataset.current_version_id = v1.id
    db_session.commit()

    # Apply recipe
    res = text_cleaning_service.apply_cleaning_recipe(
        dataset_id=str(dataset.id),
        payload={
            "enabled_steps": ["mask_pii", "repair_encoding", "remove_duplicates", "remove_empty"],
            "parameters": {"mask_pii": "[PHONE] [EMAIL] [NAME]"},
        },
        db=db_session,
    )

    assert res["applied"] is True
    assert res["new_version_hash"] is not None

    # Verify that new version exists in DB and has cleaned content
    new_version = db_session.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset.id,
        DatasetVersion.version_hash == res["new_version_hash"]
    ).first()
    assert new_version is not None
    assert new_version.row_count == 4  # 6 - 1 dup - 1 empty = 4 rows

    cleaned_df = pq.read_table(new_version.storage_path).to_pandas()
    texts = cleaned_df["text"].tolist()

    assert any("[PHONE]" in t for t in texts)
    assert any("[EMAIL]" in t for t in texts)
    assert any("cassé" in t for t in texts)
    assert not any("cassÃ©" in t for t in texts)
    assert len(texts) == 4

