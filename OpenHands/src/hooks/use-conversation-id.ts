import { useNavigation } from "#/context/navigation-context";

export function useOptionalConversationId() {
  const { conversationId } = useNavigation();

  return { conversationId };
}

export function useConversationId() {
  return useOptionalConversationId();
}
