import sys
sys.path.insert(0, '/app')

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.services.active_learning_service import active_learning_service

def verify():
    db = SessionLocal()
    try:
        datasets = db.query(Dataset).all()
        target_names = ['data', 'marketing', 'test_churn_1000']
        for name in target_names:
            ds = next((d for d in datasets if d.name == name), None)
            if not ds:
                continue
            state = active_learning_service.get_state(ds.id, db)
            print(f"\n==========================================")
            print(f"DATASET: {name} (ID: {ds.id})")
            print(f"==========================================")
            print(f"Header: round={state.header.round_number}, model={state.header.scored_by_model}, target={state.header.target_column}")
            print(f"Pool: {state.header.pool_size} ({state.header.pool_breakdown}), Budget: {state.header.budget_rows}")
            print(f"Output: {state.header.output_version} ({state.header.output_subtitle})")
            print(f"Weak cluster: {state.weak_cluster_label}")
            print(f"Strategies ({len(state.strategies)}):")
            for s in state.strategies:
                print(f"   - {s.title}: {s.rows} rows ({s.percentage}%)")
            print(f"Picks: {len(state.picks)} generated")
            for p in state.picks[:3]:
                print(f"   - {p.customer_id} | {p.why_picked} | p={p.p_yes} | label={p.label}")
            print(f"Pool points: {len(state.pool_points)} points for 2D map")
            print(f"Guardrails ({len(state.guardrails)}):")
            for g in state.guardrails[:3]:
                print(f"   - [{g.status}] {g.title}: {g.description}")
    finally:
        db.close()

if __name__ == '__main__':
    verify()

