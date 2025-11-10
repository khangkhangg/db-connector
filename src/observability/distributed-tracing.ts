/**
 * Distributed tracing support for tracking requests across services
 */

import { createLogger } from '../utils/logger';
import { randomBytes } from 'crypto';

/**
 * Trace context
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  baggage?: Record<string, string>;
}

/**
 * Span
 */
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  tags: Record<string, string | number | boolean>;
  logs: SpanLog[];
  error?: boolean;
  errorMessage?: string;
}

/**
 * Span kind
 */
export enum SpanKind {
  CLIENT = 'client',
  SERVER = 'server',
  PRODUCER = 'producer',
  CONSUMER = 'consumer',
  INTERNAL = 'internal'
}

/**
 * Span status
 */
export enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
  UNSET = 'unset'
}

/**
 * Span log
 */
export interface SpanLog {
  timestamp: number;
  fields: Record<string, any>;
}

/**
 * Trace
 */
export interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
  duration?: number;
  serviceName: string;
}

/**
 * Distributed tracer configuration
 */
export interface TracerConfig {
  serviceName: string;
  samplingRate?: number; // 0.0 to 1.0
  maxSpansPerTrace?: number;
  enableAutoInstrumentation?: boolean;
}

/**
 * Distributed tracer
 */
export class DistributedTracer {
  private logger = createLogger('DistributedTracer');
  private activeSpans = new Map<string, Span>();
  private completedTraces = new Map<string, Trace>();
  private maxTraceHistory = 1000;
  private samplingRate: number;
  private serviceName: string;

  constructor(config: TracerConfig) {
    this.serviceName = config.serviceName || 'db-connector';
    this.samplingRate = config.samplingRate ?? 1.0; // Default: sample all traces

    this.logger.info('Distributed tracer initialized', {
      serviceName: this.serviceName,
      samplingRate: this.samplingRate
    });
  }

  /**
   * Start a new trace
   */
  startTrace(name: string, kind: SpanKind = SpanKind.INTERNAL): TraceContext {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    const sampled = this.shouldSample();

    const context: TraceContext = {
      traceId,
      spanId,
      sampled
    };

    if (sampled) {
      this.startSpan(name, context, kind);
    }

    return context;
  }

  /**
   * Start a child span
   */
  startChildSpan(
    name: string,
    parentContext: TraceContext,
    kind: SpanKind = SpanKind.INTERNAL
  ): TraceContext {
    const spanId = this.generateSpanId();

    const context: TraceContext = {
      traceId: parentContext.traceId,
      spanId,
      parentSpanId: parentContext.spanId,
      sampled: parentContext.sampled,
      baggage: parentContext.baggage
    };

    if (context.sampled) {
      this.startSpan(name, context, kind);
    }

    return context;
  }

  /**
   * Start a span
   */
  private startSpan(
    name: string,
    context: TraceContext,
    kind: SpanKind
  ): Span {
    const span: Span = {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      name,
      kind,
      startTime: Date.now(),
      status: SpanStatus.UNSET,
      tags: {
        'service.name': this.serviceName
      },
      logs: []
    };

    this.activeSpans.set(context.spanId, span);

    this.logger.debug('Span started', {
      traceId: span.traceId,
      spanId: span.spanId,
      name
    });

    return span;
  }

  /**
   * End a span
   */
  endSpan(context: TraceContext, status?: SpanStatus, error?: Error): void {
    if (!context.sampled) {
      return;
    }

    const span = this.activeSpans.get(context.spanId);
    if (!span) {
      this.logger.warn('Span not found', { spanId: context.spanId });
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status || (error ? SpanStatus.ERROR : SpanStatus.OK);

    if (error) {
      span.error = true;
      span.errorMessage = error.message;
      span.tags['error'] = true;
      span.tags['error.message'] = error.message;

      if (error.stack) {
        span.tags['error.stack'] = error.stack;
      }
    }

    this.activeSpans.delete(context.spanId);
    this.addSpanToTrace(span);

    this.logger.debug('Span ended', {
      traceId: span.traceId,
      spanId: span.spanId,
      duration: span.duration,
      status: span.status
    });
  }

  /**
   * Add tag to span
   */
  setTag(
    context: TraceContext,
    key: string,
    value: string | number | boolean
  ): void {
    if (!context.sampled) {
      return;
    }

    const span = this.activeSpans.get(context.spanId);
    if (span) {
      span.tags[key] = value;
    }
  }

  /**
   * Add log to span
   */
  log(context: TraceContext, fields: Record<string, any>): void {
    if (!context.sampled) {
      return;
    }

    const span = this.activeSpans.get(context.spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        fields
      });
    }
  }

  /**
   * Set baggage item (propagated to all child spans)
   */
  setBaggage(context: TraceContext, key: string, value: string): void {
    if (!context.baggage) {
      context.baggage = {};
    }
    context.baggage[key] = value;
  }

  /**
   * Get baggage item
   */
  getBaggage(context: TraceContext, key: string): string | undefined {
    return context.baggage?.[key];
  }

  /**
   * Trace a function
   */
  async trace<T>(
    name: string,
    fn: (context: TraceContext) => Promise<T>,
    parentContext?: TraceContext,
    kind: SpanKind = SpanKind.INTERNAL
  ): Promise<T> {
    const context = parentContext
      ? this.startChildSpan(name, parentContext, kind)
      : this.startTrace(name, kind);

    try {
      const result = await fn(context);
      this.endSpan(context, SpanStatus.OK);
      return result;
    } catch (error) {
      this.endSpan(context, SpanStatus.ERROR, error as Error);
      throw error;
    }
  }

  /**
   * Add span to trace
   */
  private addSpanToTrace(span: Span): void {
    let trace = this.completedTraces.get(span.traceId);

    if (!trace) {
      trace = {
        traceId: span.traceId,
        spans: [],
        startTime: span.startTime,
        serviceName: this.serviceName
      };
      this.completedTraces.set(span.traceId, trace);

      // Maintain max history
      if (this.completedTraces.size > this.maxTraceHistory) {
        const oldestTraceId = this.completedTraces.keys().next().value;
        this.completedTraces.delete(oldestTraceId);
      }
    }

    trace.spans.push(span);

    // Update trace end time and duration
    if (!trace.endTime || span.endTime! > trace.endTime) {
      trace.endTime = span.endTime;
      trace.duration = trace.endTime! - trace.startTime;
    }
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate span ID
   */
  private generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  /**
   * Determine if trace should be sampled
   */
  private shouldSample(): boolean {
    return Math.random() < this.samplingRate;
  }

  /**
   * Extract trace context from headers (for distributed tracing)
   */
  extractContext(headers: Record<string, string>): TraceContext | null {
    // Support W3C Trace Context standard
    const traceparent = headers['traceparent'];
    if (traceparent) {
      return this.parseW3CTraceContext(traceparent);
    }

    // Support custom format
    const traceId = headers['x-trace-id'];
    const spanId = headers['x-span-id'];
    const parentSpanId = headers['x-parent-span-id'];
    const sampled = headers['x-trace-sampled'] === '1';

    if (traceId && spanId) {
      return {
        traceId,
        spanId,
        parentSpanId,
        sampled
      };
    }

    return null;
  }

  /**
   * Inject trace context into headers
   */
  injectContext(context: TraceContext): Record<string, string> {
    // W3C Trace Context format
    const version = '00';
    const flags = context.sampled ? '01' : '00';
    const traceparent = `${version}-${context.traceId}-${context.spanId}-${flags}`;

    return {
      'traceparent': traceparent,
      'x-trace-id': context.traceId,
      'x-span-id': context.spanId,
      'x-trace-sampled': context.sampled ? '1' : '0',
      ...(context.parentSpanId && { 'x-parent-span-id': context.parentSpanId })
    };
  }

  /**
   * Parse W3C trace context
   */
  private parseW3CTraceContext(traceparent: string): TraceContext | null {
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
      return null;
    }

    const [version, traceId, spanId, flags] = parts;

    if (version !== '00') {
      return null;
    }

    return {
      traceId,
      spanId,
      sampled: flags === '01'
    };
  }

  /**
   * Get trace
   */
  getTrace(traceId: string): Trace | undefined {
    return this.completedTraces.get(traceId);
  }

  /**
   * Get all traces
   */
  getTraces(limit?: number): Trace[] {
    const traces = Array.from(this.completedTraces.values());

    if (limit) {
      return traces.slice(-limit);
    }

    return traces;
  }

  /**
   * Get traces with errors
   */
  getTracesWithErrors(limit?: number): Trace[] {
    const errorTraces = Array.from(this.completedTraces.values())
      .filter(trace => trace.spans.some(span => span.error));

    if (limit) {
      return errorTraces.slice(-limit);
    }

    return errorTraces;
  }

  /**
   * Get slow traces
   */
  getSlowTraces(thresholdMs: number, limit?: number): Trace[] {
    const slowTraces = Array.from(this.completedTraces.values())
      .filter(trace => trace.duration && trace.duration > thresholdMs)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));

    if (limit) {
      return slowTraces.slice(0, limit);
    }

    return slowTraces;
  }

  /**
   * Export trace in Jaeger format
   */
  exportJaegerTrace(traceId: string): any {
    const trace = this.getTrace(traceId);
    if (!trace) {
      return null;
    }

    return {
      traceID: trace.traceId,
      spans: trace.spans.map(span => ({
        traceID: span.traceId,
        spanID: span.spanId,
        parentSpanID: span.parentSpanId,
        operationName: span.name,
        startTime: span.startTime * 1000, // microseconds
        duration: (span.duration || 0) * 1000, // microseconds
        tags: Object.entries(span.tags).map(([key, value]) => ({
          key,
          type: typeof value,
          value
        })),
        logs: span.logs.map(log => ({
          timestamp: log.timestamp * 1000,
          fields: Object.entries(log.fields).map(([key, value]) => ({
            key,
            type: typeof value,
            value
          }))
        }))
      })),
      processes: {
        [this.serviceName]: {
          serviceName: this.serviceName,
          tags: []
        }
      }
    };
  }

  /**
   * Export trace in Zipkin format
   */
  exportZipkinTrace(traceId: string): any[] {
    const trace = this.getTrace(traceId);
    if (!trace) {
      return [];
    }

    return trace.spans.map(span => ({
      traceId: span.traceId,
      id: span.spanId,
      parentId: span.parentSpanId,
      name: span.name,
      kind: span.kind.toUpperCase(),
      timestamp: span.startTime * 1000, // microseconds
      duration: (span.duration || 0) * 1000, // microseconds
      localEndpoint: {
        serviceName: this.serviceName
      },
      tags: span.tags,
      annotations: span.logs.map(log => ({
        timestamp: log.timestamp * 1000,
        value: JSON.stringify(log.fields)
      }))
    }));
  }

  /**
   * Clear trace history
   */
  clearHistory(): void {
    this.completedTraces.clear();
    this.logger.info('Trace history cleared');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalTraces: number;
    activeSpans: number;
    errorTraces: number;
    avgTraceDuration: number;
  } {
    const traces = Array.from(this.completedTraces.values());
    const errorTraces = traces.filter(t => t.spans.some(s => s.error));
    const traceDurations = traces
      .map(t => t.duration || 0)
      .filter(d => d > 0);
    const avgDuration = traceDurations.length > 0
      ? traceDurations.reduce((a, b) => a + b, 0) / traceDurations.length
      : 0;

    return {
      totalTraces: traces.length,
      activeSpans: this.activeSpans.size,
      errorTraces: errorTraces.length,
      avgTraceDuration: avgDuration
    };
  }
}
