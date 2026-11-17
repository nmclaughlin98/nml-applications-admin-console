import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_cognito as cognito,
  aws_s3 as s3,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminConsoleStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const client = userPool.addClient('AdminUserPoolClient', {
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
    });

    new ssm.StringParameter(this, 'AdminUserPoolArnParameter', {
      parameterName: '/nml-admin/prod/cognito-user-pool-arn',
      stringValue: userPool.userPoolArn,
    });

    const bucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    const certificateArn = this.node.tryGetContext('certificateArn') as string | undefined;
    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
      ...(certificateArn ? {
        domainNames: ['admin.nml-applications.com'],
        certificate: acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn),
      } : {}),
    });

    new CfnOutput(this, 'AdminUserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'AdminUserPoolArn', { value: userPool.userPoolArn });
    new CfnOutput(this, 'AdminUserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'WebsiteBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'WebsiteDistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'WebsiteDomainName', { value: distribution.distributionDomainName });
  }
}
