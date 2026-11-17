# NML Applications Central Admin Console

The hub hosts a private S3-backed React SPA and a central Cognito user pool in `eu-west-2`. Project backends (spokes) own their runtime controls and validate the admin user's Cognito ID token.

## Infrastructure

Use Node.js 22 or later and AWS credentials for the target account:

```sh
cd infra
npm ci
npm run synth
npx cdk deploy
```

The stack outputs the user pool ID, ARN, client ID, bucket name, distribution ID, and CloudFront domain. It also publishes the pool ARN at `/nml-admin/prod/cognito-user-pool-arn` in SSM. The pool is retained on stack deletion; users must be provisioned by an administrator. For example:

```sh
aws cognito-idp admin-create-user --region eu-west-2 --user-pool-id <pool-id> \
  --username <email> --user-attributes Name=email,Value=<email>
```

The initial temporary password is delivered by Cognito. The login screen prompts the user to set a permanent password.

By default the distribution uses its CloudFront domain. To enable `admin.nml-applications.com`, obtain an ACM certificate in **us-east-1** covering that name and deploy with `npx cdk deploy -c certificateArn=<certificate-arn>`. Point the hostname's DNS record to the output CloudFront domain. The certificate and DNS are managed separately.

## Frontend

```sh
cd frontend
npm ci
cp .env.example .env.local
# Set the two Cognito values from the stack outputs in .env.local.
npm run dev
npm run build
```

`VITE_BLOCKBUSTER_ADMIN_API_BASE_URL` optionally overrides the Blockbuster Theatre endpoint. Vite embeds these values into the public bundle; never place secrets in `VITE_` variables. Publish `frontend/dist` to the output bucket and invalidate CloudFront after deploying a new build, for example:

```sh
aws s3 sync dist/ s3://<bucket-name>/ --delete
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths '/*'
```

## Spoke contract

Add projects to `frontend/src/config/spokes.ts`. Each spoke must permit the console origin in CORS, including `GET`, `PATCH`, `Authorization`, and `Content-Type`, and independently verify the Cognito ID token's signature, issuer, audience, expiry, and authorization on every request. The console sends the ID token in the authorization header.

- `GET /status` returns JSON such as `{"appName":"Blockbuster Theatre","stage":"prod","version":"1.0.0","health":"healthy"}`.
- `GET /flags` returns `{"maintenanceMode":false,"routes":{"GET /movies/{id}":true},"features":{"autoLinkBookings":true}}`.
- `PATCH /flags` accepts a partial update, for example `{"routes":{"GET /movies/{id}":false}}`. The spoke must merge nested keys rather than replace the whole group, and return the complete updated flags object in the same format as `GET /flags`. Boolean values are displayed as returned by the spoke.

The dashboard waits for each update to finish and uses the returned state; a failed request leaves the previous values visible.
