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

export interface UseAccountFormOptions {
  initialData?: Account | null;
  onSave: (data: AccountFormData) => Promise<void>;
  onSuccess?: () => void;
  onError?: (error: string) => void;
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