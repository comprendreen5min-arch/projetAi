from app.services.lineage_service import lineage_service


def test_lineage_hash_determinism():
    parent_hash = "abc123parent"
    transformation = "FILTER_ROWS"
    parameters = {"threshold": 10.0, "column": "feature_a"}
    data_hash = "datahash987654"

    hash_1 = lineage_service.generate_version_hash(
        parent_version_hash=parent_hash,
        transformation_name=transformation,
        parameters=parameters,
        data_hash=data_hash,
    )

    hash_2 = lineage_service.generate_version_hash(
        parent_version_hash=parent_hash,
        transformation_name=transformation,
        parameters=parameters,
        data_hash=data_hash,
    )

    assert hash_1 == hash_2
    assert len(hash_1) == 64  # SHA-256


def test_lineage_hash_changes_with_parameters():
    parent_hash = "abc123parent"
    transformation = "FILTER_ROWS"
    data_hash = "datahash987654"

    hash_a = lineage_service.generate_version_hash(
        parent_version_hash=parent_hash,
        transformation_name=transformation,
        parameters={"threshold": 10.0},
        data_hash=data_hash,
    )

    hash_b = lineage_service.generate_version_hash(
        parent_version_hash=parent_hash,
        transformation_name=transformation,
        parameters={"threshold": 20.0},
        data_hash=data_hash,
    )

    assert hash_a != hash_b


def test_root_lineage_hash():
    root_hash = lineage_service.generate_version_hash(
        parent_version_hash=None,
        transformation_name="CSV_INGESTION",
        parameters={"filename": "test.csv"},
        data_hash="somedatahash",
    )
    assert isinstance(root_hash, str)
    assert len(root_hash) == 64

