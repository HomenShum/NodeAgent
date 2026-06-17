# AWS-Hackathon / VisualLabs App Map

Goal: adapt NodeAgent into an AWS-native visual/media workflow without locking
the core runtime to AWS.

Target repo: https://github.com/quachphu/AWS-Hackathon

## Credentials

Ask the human for:

| Variable | Purpose |
|---|---|
| `AWS_REGION` | region for runtime resources |
| `AWS_PROFILE` | local AWS profile or SSO session |
| `NODEAGENT_ARTIFACT_BUCKET` | S3 bucket for media and receipts |
| `NODEAGENT_QUEUE_URL` | SQS queue for scheduled work |
| app model keys | only if the app uses live model providers |

## Runtime Mapping

| NodeAgent need | AWS service |
|---|---|
| jobs/frames/leases/journal | DynamoDB conditional writes |
| scheduling | SQS, EventBridge, or Step Functions |
| artifacts/media | S3 |
| workers | Lambda for light jobs, ECS/Fargate for heavier render/media jobs |
| analytics | ClickHouse or warehouse, read-only from runtime perspective |

## Spin Up

```bash
aws sts get-caller-identity
npm install
npm run nodeagent:durable:smoke
# after AWS adapter/tools exist:
npm run nodeagent:aws:smoke
npm run app:visual-labs:smoke
```

## App Tools To Add

| Tool | Purpose |
|---|---|
| `import_visual_asset` | register source asset in S3 and metadata store |
| `analyze_visual_asset` | run local/model analysis and return structured evidence |
| `generate_visual_plan` | create bounded edit/build plan |
| `render_visual_artifact` | enqueue render job and store output reference |
| `verify_visual_artifact` | check output exists and matches receipt evidence |

## Done Criteria

- AWS durable adapter smoke passes.
- One visual workflow produces an artifact in S3.
- Receipt stores artifact refs, not raw secrets or huge binary payloads.
- ClickHouse/analytics is not required to recover job state.
