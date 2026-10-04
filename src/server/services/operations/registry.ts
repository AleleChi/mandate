import { OperationalTool, ToolCategory, ToolContext, ToolFilter, ToolResult } from './types';
import { eventTools } from './tools/eventTools';
import { registrationTools } from './tools/registrationTools';
import { childrenTools } from './tools/childrenTools';
import { parentTools } from './tools/parentTools';
import { attendanceTools } from './tools/attendanceTools';
import { volunteerTools } from './tools/volunteerTools';
import { dutyTools } from './tools/dutyTools';
import { passTools } from './tools/passTools';
import { safetyTools } from './tools/safetyTools';
import { reportTools } from './tools/reportTools';
import { communicationTools } from './tools/communicationTools';
import { systemTools } from './tools/systemTools';

export class OperationsToolRegistry {
  private tools = new Map<string, OperationalTool>();

  constructor() {
    this.registerAll([
      ...eventTools,
      ...registrationTools,
      ...childrenTools,
      ...parentTools,
      ...attendanceTools,
      ...volunteerTools,
      ...dutyTools,
      ...passTools,
      ...safetyTools,
      ...reportTools,
      ...communicationTools,
      ...systemTools
    ]);
  }

  private registerAll(tools: OperationalTool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  public getTool(name: string): OperationalTool | undefined {
    return this.tools.get(name);
  }

  public listTools(): OperationalTool[] {
    return Array.from(this.tools.values());
  }

  public getToolsByCategory(category: ToolCategory): OperationalTool[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  public async executeTool(
    name: string,
    context: ToolContext,
    filters?: ToolFilter
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      console.warn(`[OperationsAssistant] Tool "${name}" not found in registry.`);
      return {
        success: false,
        authorized: true,
        toolName: name,
        error: `Tool "${name}" is not registered in Operations Assistant.`
      };
    }

    // Role-based permission check
    if (tool.requiredRoles && tool.requiredRoles.length > 0) {
      const actorRole = context.actor?.role;
      if (!actorRole || !tool.requiredRoles.includes(actorRole)) {
        console.warn(`[OperationsAssistant] Access denied to tool "${name}" for role "${actorRole}".`);
        return {
          success: false,
          authorized: false,
          toolName: name,
          error: "You don't have permission to view those details."
        };
      }
    }

    try {
      const result = await tool.execute(context, filters);
      const durationMs = Date.now() - startTime;

      // Safe Observability Logging (No sensitive medical/PII content logged)
      const recordCount = result.totalCount ?? result.displayedCount ?? (Array.isArray(result.data) ? result.data.length : 1);
      console.log(
        `[OperationsAssistant] Tool: ${name} | Duration: ${durationMs}ms | Success: ${result.success} | Records: ${recordCount}`
      );

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      console.error(`[OperationsAssistant] Tool execution error in "${name}" (${durationMs}ms):`, err.message);
      return {
        success: false,
        authorized: true,
        toolName: name,
        error: err.message || 'Execution failed'
      };
    }
  }
}

export const operationsToolRegistry = new OperationsToolRegistry();
