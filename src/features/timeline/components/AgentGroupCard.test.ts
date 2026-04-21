import { scrollToTaskNode } from "@/features/timeline/components/AgentGroupCard";

describe("scrollToTaskNode", () => {
	const originalDocument = global.document;

	afterEach(() => {
		Object.defineProperty(global, "document", {
			value: originalDocument,
			configurable: true,
			writable: true,
		});
		jest.restoreAllMocks();
	});

	it("scrolls the matching task row into view when found", () => {
		const scrollIntoView = jest.fn();
		const target = { scrollIntoView } as unknown as HTMLElement;
		const querySelector = jest.fn().mockReturnValue(target);
		Object.defineProperty(global, "document", {
			value: { querySelector },
			configurable: true,
		});

		scrollToTaskNode("task_2");

		expect(querySelector).toHaveBeenCalledWith('[data-task-id="task_2"]');
		expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
	});

	it("returns quietly when the task row is not mounted", () => {
		const querySelector = jest.fn().mockReturnValue(null);
		Object.defineProperty(global, "document", {
			value: { querySelector },
			configurable: true,
		});

		expect(() => scrollToTaskNode("task_missing")).not.toThrow();
		expect(querySelector).toHaveBeenCalledWith('[data-task-id="task_missing"]');
	});
});
