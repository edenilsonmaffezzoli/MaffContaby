export type TargetAuthMode = 'auto' | 'form' | 'json';

export type TargetAuthInput = {
  loginUrl: string;
  username: string;
  password: string;
  mode?: TargetAuthMode;
  jsonUsernameField?: string;
  jsonPasswordField?: string;
  tokenPath?: string;
  formUsernameField?: string;
  formPasswordField?: string;
};
