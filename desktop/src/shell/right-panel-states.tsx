import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { LucideSvg } from './lucide-svg';

export function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="shell-state-card" role="status" aria-busy="true" aria-label={label}>
      <div className="shell-state-card__heading">
        <LucideSvg name="loader-circle" size="sm" className="shell-ic--spin" />
        <span>{label}</span>
      </div>
      <div className="shell-skel shell-skel--w72" />
      <div className="shell-skel shell-skel--w92" />
      <div className="shell-skel shell-skel--w54" />
    </div>
  );
}

export function PanelError({
  title,
  message,
  retryId,
  onRetry,
}: {
  title: string;
  message: string;
  retryId: string;
  onRetry?: () => void;
}) {
  return (
    <div className="shell-state-card shell-state-card--error" role="alert">
      <div className="shell-state-card__heading shell-state-card__heading--danger">
        <LucideSvg name="circle-alert" size="sm" />
        <span>{title}</span>
      </div>
      <p className="shell-state-card__body">{message}</p>
      {onRetry ? (
        <div className="shell-state-card__actions">
          <button type="button" className="shell-btn" data-state-retry={retryId} onClick={onRetry}>
            <LucideSvg name="refresh-cw" size="sm" />
            <span>重试</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PanelEmpty({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  actionId,
  onAction,
}: {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: string;
  actionId: string;
  onAction: () => void;
}) {
  return (
    <div className="shell-state-card">
      <div className="shell-empty-icon" aria-hidden="true">
        <LucideSvg name={icon} />
      </div>
      <p className="shell-state-card__title">{title}</p>
      <p className="shell-state-card__body">{description}</p>
      <div className="shell-state-card__actions">
        <button type="button" className="shell-btn shell-btn--primary" data-empty-action={actionId} onClick={onAction}>
          {actionIcon ? <LucideSvg name={actionIcon} size="sm" /> : null}
          <span>{actionLabel}</span>
        </button>
      </div>
    </div>
  );
}

export function InfoHint({ label, content }: { label: string; content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger type="button" className="shell-hint-btn" aria-label={label}>
        <LucideSvg name="info" size="sm" />
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}
