# AWS DynamoDB Adapter

Status: blueprint for AWS-native durable runtime.

Official references:

- AWS CLI quickstart and SSO setup: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html
- AWS IAM access keys: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html

Prefer AWS IAM Identity Center, role-based auth, or CI OIDC where possible. Use
long-lived access keys only for throwaway local development accounts.

## Credentials

Ask the human for:

| Variable | Purpose |
|---|---|
| `AWS_REGION` | region for DynamoDB/SQS/S3 |
| `AWS_PROFILE` | local profile if using AWS SSO or shared credentials |
| `NODEAGENT_DDB_TABLE_PREFIX` | resource name prefix for jobs, frames, leases, journal |
| `NODEAGENT_ARTIFACT_BUCKET` | S3 bucket for receipts/artifacts |
| `NODEAGENT_QUEUE_URL` | SQS queue URL if using SQS scheduler |

Credential handoff:

```text
I need AWS access for the NodeAgent durable adapter:
- AWS_REGION
- AWS_PROFILE or configured AWS SSO session
- NODEAGENT_ARTIFACT_BUCKET
- NODEAGENT_QUEUE_URL if SQS is the scheduler

Please authenticate locally with aws sso login or configure the profile outside
the repo. Do not paste AWS_SECRET_ACCESS_KEY into chat or commit it.
```

## Spin Up

```bash
aws sts get-caller-identity
npm install
npm run nodeagent:durable:smoke
# after the AWS adapter exists:
npm run nodeagent:aws:smoke
```

## Adapter Mapping

| NodeAgent port | AWS mapping |
|---|---|
| `DurableJobStore` | DynamoDB `Jobs` item keyed by `jobId` |
| `DurableFrameStore` | DynamoDB `Frames` item keyed by `frameId` |
| `LeaseStore` | DynamoDB conditional write on `resourceId` and `expiresAt` |
| `StepJournal` | DynamoDB conditional put with `attribute_not_exists(key)` |
| `DurableScheduler` | SQS, EventBridge, or Step Functions |
| `ArtifactStore` | S3 JSON objects |
| `ToolRuntime` | Lambda/ECS/Fargate/app process tool executor |

## Implementation Notes

- Use DynamoDB conditional writes for lease claim and journal `writeOnce`.
- Keep ClickHouse or analytics stores read-only for runtime analytics; do not
  use analytics tables as the transactional job store.
- Use S3 for media, artifacts, and large receipts.
- Scope IAM to exact table, bucket, and queue ARNs.

## Done Criteria

- `aws sts get-caller-identity` succeeds for the selected profile.
- Provider smoke proves enqueue, lease, stale lease reclaim, journal write once,
  receipt store/load, and duplicate replay.
- Created resource names are printed in the final handoff.

## Coding-Agent Prompt

```text
Implement an AWS DurableRuntimePorts adapter with DynamoDB for jobs, frames,
leases, and journal, S3 for artifacts, and SQS/EventBridge/Step Functions for
scheduling. Use conditional writes for lease claim and journal writeOnce. Add
npm run nodeagent:aws:smoke. Do not log AWS credentials or receipt payloads
containing secrets.
```
