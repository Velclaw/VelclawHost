# VelclawHost AWS Preview migration

## Current decision

- AWS target region: `ap-southeast-2` (Sydney).
- Cloudflare remains the Preview edge; no DNS or Production changes are part of this work.
- Render remains the rollback origin until AWS Preview passes independent end-to-end validation.
- The existing Express control plane can be containerized for ECS/Fargate.
- The current runtime worker invokes Docker through `child_process`, clones Git repositories, writes workspaces, and starts per-project containers. It cannot be moved unchanged into Fargate. It requires a separately isolated EC2-backed container host or another reviewed execution service.

## Bootstrap template scope

`infra/aws/velclawhost-preview-bootstrap.yaml` is a CloudFormation template for a later, explicitly approved bootstrap. It creates:

- GitHub Actions OIDC provider and a Preview-environment-only deployment role.
- Two immutable, scan-on-push ECR repositories with image lifecycle limits.
- An empty ECS Preview cluster.
- A CloudWatch log group with short retention.
- Separate empty task roles for the control plane and runtime worker.

It deliberately does **not** create or start ECS services, EC2 instances, Auto Scaling Groups, ALB, NAT gateways, VPCs, RDS, public IPs, or databases. No AWS resources are created by committing this template.

## Required GitHub configuration

Create a GitHub Environment named `preview` for `Velclaw/app-velclaw`. After the bootstrap stack is created by an authorized operator, add only this environment variable:

- `AWS_ROLE_ARN`: value of CloudFormation output `GitHubPreviewDeployRoleArn`.

Do not add AWS access keys. A workflow using this role must set:

```yaml
permissions:
  contents: read
  id-token: write
environment: preview
```

The role trust policy requires the exact OIDC subject
`repo:Velclaw/app-velclaw:environment:preview` and audience
`sts.amazonaws.com`. Do not broaden it to all branches or repositories.

## Pre-deployment gates

1. Secure the AWS root user with MFA; do not use root for deployment.
2. Confirm the account ID and region in the AWS console.
3. Review CloudFormation change set and IAM trust/policies before execution.
4. Set an AWS Budget and billing alerts before creating compute/network/database resources.
5. Confirm whether the account already has a VPC suitable for Preview. Do not create NAT gateways by default.
6. Define a dedicated PostgreSQL strategy and migration/backup plan. Do not point Preview at a production database.
7. Decide the isolated runtime-worker model. The current Docker-in-Docker assumptions need an EC2 host with explicit network, IAM, disk, container, and tenant isolation controls.
8. Add a deploy workflow only after the task definitions, networking, secrets source, and health checks are reviewed.

## Cost boundary

This repository change and template authoring do not provision AWS resources. The template itself is not deployed by CI.

Potential recurring costs begin when infrastructure is provisioned or used. ALB, NAT Gateway, EC2, Fargate tasks, RDS, public IPv4, ECR storage, and CloudWatch ingestion/storage can incur charges. No such resources may be created until a written estimate for the selected sizing/availability and explicit approval are recorded.

## Verification and cutover

- Build and push immutable image tags using commit SHA.
- Run the control plane in an isolated Preview service and verify `GET /api/v1/health` (the server also retains `GET /api/health` for compatibility).
- Verify Auth.js callback/cookie behavior using the Preview hostname.
- Verify database connectivity and queue persistence with a dedicated Preview database.
- Verify runtime worker deployment, tenant isolation, capacity limits, and teardown.
- Route only the authorized Cloudflare Preview hostname after successful tests.
- Keep Render unchanged until AWS Preview is stable and rollback is tested.

## Runtime worker security and readiness findings

The first application-code review identified additional gates before any worker is exposed or any AWS compute is provisioned:

- Runtime worker protected endpoints must fail closed when `RUNTIME_WORKER_TOKEN` is absent. The current hardening branch changes missing-token behavior to HTTP 503 and makes the control plane reject remote-worker calls without a configured token.
- The worker's runtime registry is currently held in process memory. A worker restart loses its deployment-to-container map and allocated-port bookkeeping; implement Docker-label reconciliation and durable metadata before production use.
- The runtime worker requires access to a Docker daemon. Its container image installs the Docker CLI/engine package but does not itself establish a daemon or a secure socket binding. The EC2 host design must define daemon ownership, socket exposure, IAM, network boundaries, disk quotas, cleanup, and tenant isolation.
- The control plane currently contains a direct Docker execution path as well as a remote-worker path. AWS Preview must explicitly select the remote executor and must not accidentally schedule customer builds on the Fargate control-plane task.

These are code/design gates, not evidence of a deployed service. The AWS account still has no Preview stack, ECS cluster, or ECR repositories. Cost Explorer access is disabled and no AWS Budgets were returned, so a reliable cost estimate cannot yet be generated from account billing data.
