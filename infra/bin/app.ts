import { App } from 'aws-cdk-lib';
import { AdminConsoleStack } from '../lib/admin-console-stack';

const app = new App();
new AdminConsoleStack(app, 'NmlAdminConsole', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'eu-west-2' },
});
