import {
  ArrowLeft,
  ArrowRight,
  ChatBubble,
  Check,
  Download,
  EditPencil,
  Eye,
  Filter,
  FloppyDiskArrowIn,
  Import,
  InputSearch,
  Key,
  LogOut,
  MagicWand,
  NavArrowLeft,
  NavArrowRight,
  PagePlus,
  Play,
  Plus,
  Refresh,
  Send,
  Trash,
  Upload,
  Xmark
} from 'iconoir-react';

const icons = {
  add: Plus,
  back: ArrowLeft,
  cancel: Xmark,
  chat: ChatBubble,
  check: Check,
  delete: Trash,
  detail: Eye,
  download: Download,
  edit: EditPencil,
  export: Download,
  filter: Filter,
  generate: MagicWand,
  import: Import,
  key: Key,
  logout: LogOut,
  next: NavArrowRight,
  play: Play,
  preview: Eye,
  previous: NavArrowLeft,
  refresh: Refresh,
  reset: Refresh,
  save: FloppyDiskArrowIn,
  search: InputSearch,
  send: Send,
  start: Play,
  upload: Upload,
  use: ArrowRight,
  page: PagePlus
};

export default function ActionIcon({ name, size = 16, strokeWidth = 1.9, ...props }) {
  const Icon = icons[name] || Check;
  return (
    <Icon
      aria-hidden="true"
      className="btn-action-icon"
      height={size}
      strokeWidth={strokeWidth}
      width={size}
      {...props}
    />
  );
}
