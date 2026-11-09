import hashlib
import json
from typing import Any, Dict, Optional


class LineageService:
    @staticmethod
    def generate_version_hash(
        parent_version_hash: Optional[str] = None,
        transformation_name: str = "",
        parameters: Optional[Dict[str, Any]] = None,
        data_hash: str = "",
        dataset_id: Optional[Any] = None,
    ) -> str:
        """Computes a deterministic cryptographic SHA-256 hash representing
        an immutable dataset version based on its dataset context, lineage,
        transformation parameters, and underlying data payload.
        """
        canonical_params = json.dumps(parameters or {}, sort_keys=True)
        parent_identifier = parent_version_hash if parent_version_hash else "ROOT"
        dataset_identifier = str(dataset_id) if dataset_id else "GLOBAL"

        hasher = hashlib.sha256()
        hasher.update(dataset_identifier.encode("utf-8"))
        hasher.update(parent_identifier.encode("utf-8"))
        hasher.update(transformation_name.encode("utf-8"))
        hasher.update(canonical_params.encode("utf-8"))
        hasher.update(data_hash.encode("utf-8"))

        return hasher.hexdigest()


lineage_service = LineageService()
