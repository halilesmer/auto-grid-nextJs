export interface Account {
  id: string;
  account_name: string;
  env_type: string;
  login: number;
  password: string;
  server: string;
  mt5_path: string;
  notes: string;
}

export interface AccountFormData {
  account_name: string;
  login: number;
  password: string;
  server: string;
  env_type: 'DEMO' | 'LIVE';
  mt5_path: string;
  notes: string;
}

export interface MT5PathOption {
  value: string;
  label: string;
}

export interface AccountFormErrors {
  account_name?: string;
  login?: string;
  password?: string;
  server?: string;
  env_type?: string;
  mt5_path?: string;
  notes?: string;
  general?: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

export interface DuplicateAccountProblem extends ProblemDetail {
  type: 'https://auto-grid.io/errors/duplicate-account';
  title: 'Duplicate Account';
  status: 409;
  code: 'DUPLICATE_ACCOUNT';
  existing_account: Account;
}

export interface ApiErrorResponse<T extends ProblemDetail = ProblemDetail> {
  detail: T;
}

export function isDuplicateAccountError(
  err: unknown
): err is { response?: { data?: ApiErrorResponse<DuplicateAccountProblem>; status: number } } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: unknown }).response === 'object' &&
    (err as { response?: { status: number } }).response?.status === 409 &&
    typeof (err as { response?: { data?: ApiErrorResponse<DuplicateAccountProblem> } }).response?.data?.detail === 'object' &&
    (err as { response?: { data?: ApiErrorResponse<DuplicateAccountProblem> } }).response?.data?.detail?.code === 'DUPLICATE_ACCOUNT'
  );
}

export interface UseAccountFormOptions {
  initialData?: Account | null;
  existingAccounts?: Account[];
  isLoading?: boolean;
  onSave: (data: AccountFormData) => Promise<void>;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onDuplicate?: (existingAccount: Account) => void;
}

export interface UseAccountFormReturn {
  formData: AccountFormData;
  errors: AccountFormErrors;
  isSaving: boolean;
  showPassword: boolean;
  handleChange: (name: keyof AccountFormData, value: string | number) => void;
  handleBlur: (name: keyof AccountFormData) => void;
  togglePassword: () => void;
  validateField: (name: keyof AccountFormData) => boolean;
  validateForm: () => boolean;
  handleSubmit: () => Promise<void>;
  resetForm: (data?: Account | null) => void;
}

export interface UseMT5ScannerReturn {
  paths: string[];
  isScanning: boolean;
  error: string | null;
  scan: () => Promise<void>;
}

export interface UseAccountsReturn {
  accounts: Account[];
  isLoading: boolean;
  error: string | null;
  fetchAccounts: () => Promise<void>;
  createAccount: (data: AccountFormData) => Promise<Account>;
  updateAccount: (id: string, data: AccountFormData) => Promise<Account>;
  deleteAccount: (id: string) => Promise<void>;
}

export interface AccountDropdownProps {
  accounts: Account[];
  selectedAccount: string | null;
  activeAccount: Account | null;
  onSelect: (accountId: string) => void;
  disabled?: boolean;
}

export interface AccountActionsProps {
  activeAccount: Account | null;
  isRunning: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDownloadLog: () => void;
  onAdd: () => void;
  disabled?: boolean;
}

export interface AccountFormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export interface AccountFormProps {
  formData: AccountFormData;
  errors: AccountFormErrors;
  isSaving: boolean;
  isLoading?: boolean;
  showPassword: boolean;
  mt5Paths: string[];
  isScanningMT5: boolean;
  useCustomPath: boolean;
  onChange: (name: keyof AccountFormData, value: string | number) => void;
  onBlur: (name: keyof AccountFormData) => void;
  onTogglePassword: () => void;
  onMT5PathSelect: (path: string) => void;
  onUseCustomPathChange: (value: boolean) => void;
  onRescanMT5: () => void;
  onSubmit: () => void;
  onEditExisting?: () => void;
}

export interface MT5PathSelectorProps {
  paths: string[];
  selectedPath: string;
  isScanning: boolean;
  useCustomPath: boolean;
  onPathSelect: (path: string) => void;
  onUseCustomPathChange: (value: boolean) => void;
  onRescan: () => void;
  onCustomPathChange: (path: string) => void;
}

export interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showPassword: boolean;
  onToggleShow: () => void;
  error?: string;
}

export interface EnvTypeBadgeProps {
  envType: 'DEMO' | 'LIVE';
}