export type TargetAuthMode = 'auto' | 'form' | 'json';

export type TargetAuthInput = {
  loginUrl: string;
  username: string;
  password: string;
  mode?: TargetAuthMode;
  /** Nomes dos campos no POST JSON (modo json). Default: username, password */
  jsonUsernameField?: string;
  jsonPasswordField?: string;
  /** Caminho no JSON de resposta (modo json). Default: token */
  tokenPath?: string;
  /** Nomes dos inputs HTML (modo form). Auto-detect se omitido */
  formUsernameField?: string;
  formPasswordField?: string;
};
