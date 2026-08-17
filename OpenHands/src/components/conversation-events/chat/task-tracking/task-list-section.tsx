import { useTranslation } from "react-i18next";
import { TaskItem } from "./task-item";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import { TaskItem as TaskItemType } from "#/types/agent-server/core/base/common";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";

interface TaskListSectionProps {
  taskList: TaskItemType[];
}

export function TaskListSection({ taskList }: TaskListSectionProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex flex-col overflow-clip bg-[var(--oh-surface-raised)] border border-white/10 rounded-2xl w-full shadow-sm my-2">
      {/* Header Tabs */}
      <div className="flex gap-2 items-center border-b border-white/5 h-[41px] px-3.5 shrink-0 bg-white/[0.02]">
        <LessonPlanIcon className="shrink-0 w-4 h-4 text-[var(--oh-color-primary)]" />
        <Typography.Text className="text-xs text-white font-semibold tracking-tight whitespace-pre">
          {t(I18nKey.COMMON$TASKS)}
        </Typography.Text>
      </div>

      {/* Task Items */}
      <div className="divide-y divide-white/[0.04]">
        {taskList.map((task, index) => (
          <TaskItem key={`task-${index}`} task={task} />
        ))}
      </div>
    </div>
  );
}
