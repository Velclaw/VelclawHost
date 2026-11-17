# Render removal and AWS cutover

VelclawHost is moving away from Render.

## Target architecture

- Cloudflare Workers: public edge and request routing.
- AWS: control-plane API and isolated container runtime.
- Database: dedicated VelclawHost database; never reuse OCodeJS databases.

## Runtime configuration

Set the Cloudflare Worker variable `CONTROL_PLANE_ORIGIN` to the HTTPS endpoint of the AWS-hosted control plane. The Worker deliberately returns HTTP 503 when this variable is absent and HTTP 502 when AWS cannot be reached. It has no Render fallback.

## Cutover gates

Do not disable or delete the existing Render service until all of the following are verified:

1. AWS control plane and runtime worker are deployed in a non-production environment.
2. Database migrations and persistence are verified against the dedicated VelclawHost database.
3. Health, authentication, deployment queue, runtime isolation, and rollback tests pass.
4. Cloudflare Preview routes to AWS and returns successful smoke-test responses.
5. Production cutover is explicitly approved.

The current AWS account has no ECS cluster, ECR repository, EC2 runtime host, RDS instance, or load balancer in the inspected region. Provisioning infrastructure requires a non-root deployment identity and an explicit cost-approved plan.

The existing Render service is retained only as a temporary rollback target during migration. No other Render service is in scope.
