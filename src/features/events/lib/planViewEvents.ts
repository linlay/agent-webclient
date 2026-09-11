const PLAN_VIEW_EVENT_TYPES = new Set([
	"plan.create",
	"plan.update",
	"task.start",
	"task.complete",
	"task.fail",
	"task.cancel",
]);

export function isPlanViewEventType(type: string): boolean {
	return PLAN_VIEW_EVENT_TYPES.has(type);
}
