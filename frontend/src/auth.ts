import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js'

const poolId = import.meta.env.VITE_ADMIN_USER_POOL_ID
const clientId = import.meta.env.VITE_ADMIN_USER_POOL_CLIENT_ID

export const configurationError = !poolId || !clientId
  ? 'Set VITE_ADMIN_USER_POOL_ID and VITE_ADMIN_USER_POOL_CLIENT_ID before signing in.'
  : null

const pool = configurationError ? null : new CognitoUserPool({
  UserPoolId: poolId,
  ClientId: clientId,
})

export type LoginResult =
  | { kind: 'signed-in'; user: CognitoUser }
  | { kind: 'new-password'; user: CognitoUser; requiredAttributes: string[] }

export function signIn(email: string, password: string): Promise<LoginResult> {
  if (!pool) return Promise.reject(new Error(configurationError ?? 'Authentication is not configured.'))
  const user = new CognitoUser({ Username: email, Pool: pool })
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: () => resolve({ kind: 'signed-in', user }),
      onFailure: reject,
      newPasswordRequired: (_attributes, requiredAttributes) => {
        resolve({ kind: 'new-password', user, requiredAttributes: requiredAttributes ?? [] })
      },
    })
  })
}

export function completeNewPassword(user: CognitoUser, password: string, attributes: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(password, attributes, {
      onSuccess: () => resolve(),
      onFailure: reject,
    })
  })
}

export function currentUser(): CognitoUser | null {
  return pool?.getCurrentUser() ?? null
}

export function idToken(user: CognitoUser): Promise<string> {
  return new Promise((resolve, reject) => {
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      if (error || !session?.isValid()) {
        reject(error ?? new Error('Your session has expired. Please sign in again.'))
      } else {
        resolve(session.getIdToken().getJwtToken())
      }
    })
  })
}
