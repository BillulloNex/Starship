import { useNavigation } from "#/context/navigation-context";

export function useOptionalConversationId(): { conversationId: string | null } {
  const { conversationId } = useNavigation();

  return { conversationId };
}

export function useConversationId(): { conversationId: string } {
  const { conversationId } = useNavigation();

  return { conversationId: conversationId ?? "" };
}
