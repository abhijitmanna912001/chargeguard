import { Bot, Cog, Scale, User, type LucideIcon } from "lucide-react";
import type { ActionLogActor } from "@/contracts";

const ICON: Record<ActionLogActor, LucideIcon> = {
  agent: Bot,
  rule: Scale,
  human: User,
  system: Cog,
};

export const ACTOR_LABEL: Record<ActionLogActor, string> = {
  agent: "Agent",
  rule: "Rule",
  human: "Human",
  system: "System",
};

/** Decorative: always put the actor's name in text next to it. */
export function ActorIcon({ actor, className = "size-4" }: { actor: ActionLogActor; className?: string }) {
  const Icon = ICON[actor];
  return <Icon aria-hidden="true" className={className} />;
}
