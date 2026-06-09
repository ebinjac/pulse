# OpenShift manifests

Example resources for split API + worker + web deployment. Replace image names with your registry paths.

## Apply order

```bash
# 1. Secrets (from secrets.example.yaml — use real values)
oc apply -f secrets.example.yaml

# 2. Migrate (once per schema change)
oc apply -f migrate-job.yaml
oc wait --for=condition=complete job/pulse-migrate --timeout=120s

# 3. Application workloads
oc apply -f api-deployment.yaml
oc apply -f worker-deployment.yaml
oc apply -f web-deployment.yaml
```

## Scale workers

```bash
oc scale deployment/pulse-worker --replicas=4
```

See [docs/deploy/openshift-rhel.md](../../docs/deploy/openshift-rhel.md) for full runbook.
