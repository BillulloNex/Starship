import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TaskItem as TaskItemType } from "#/types/agent-server/core/base/common";
import CircleIcon from "#/icons/u-circle.svg?react";
import CheckCircleIcon from "#/icons/u-check-circle.svg?react";
import CheckCircleHalfIcon from "#/icons/u-check-circle-half.svg?react";
import { cn } from "#/utils/utils";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

interface TaskItemProps {
  task: TaskItemType;
}

export function TaskItem({ task }: TaskItemProps) {
  const { t } = useTranslation("openhands");

  const icon = useMemo(() => {
    switch (task.status) {
      case "todo":
        return <CircleIcon className="w-4 h-4 text-[var(--oh-muted)]" />;
      case "in_progress":
        return <CheckCircleHalfIcon className="w-4 h-4 text-[var(--oh-color-primary)] animate-pulse" />;
      case "done":
        return <CheckCircleIcon className="w-4 h-4 text-emerald-400" />;
      default:
        return <CircleIcon className="w-4 h-4 text-[var(--oh-muted)]" />;
    }
  }, [task.status]);

  const isDoneStatus = task.status === "done";

  return (
    <div
      className="flex gap-3 items-center px-4 py-2.5 w-full hover:bg-white/[0.02] transition-colors"
      data-name="item"
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex flex-col items-start justify-center leading-snug font-normal min-w-0">
        <Typography.Text
          className={cn(
            "text-xs text-white font-medium tracking-tight",
            isDoneStatus && "text-[var(--oh-muted)] line-through decoration-white/20",
          )}
        >
          {task.title}
        </Typography.Text>
        {task.notes && (
          <Typography.Text className="text-[11px] text-[var(--oh-muted)] mt-0.5">
            {t(I18nKey.TASK_TRACKING_OBSERVATION$TASK_NOTES)}: {task.notes}
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
