import { createHmac, timingSafeEqual } from 'node:crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { chatRailRequest } from '../ChatRail/transport';

/** Events older or newer than this are refused, so a captured request cannot be replayed later. */
const TOLERANCE_SECONDS = 300;

const EVENTS: INodePropertyOptions[] = [
	{ name: 'AI Reply Blocked', value: 'ai.reply_blocked' },
	{ name: 'AI Reply Generated', value: 'ai.reply_generated' },
	{ name: 'Call Received', value: 'call.received' },
	{ name: 'Connection Connected', value: 'connection.connected' },
	{ name: 'Connection Degraded', value: 'connection.degraded' },
	{ name: 'Connection Disconnected', value: 'connection.disconnected' },
	{ name: 'Connection Requires Repair', value: 'connection.requires_repair' },
	{ name: 'Group Participants Changed', value: 'group.participants_changed' },
	{ name: 'Message Accepted', value: 'message.accepted' },
	{ name: 'Message Delivered', value: 'message.delivered' },
	{ name: 'Message Edited', value: 'message.edited' },
	{ name: 'Message Failed', value: 'message.failed' },
	{ name: 'Message Queued', value: 'message.queued' },
	{ name: 'Message Reaction', value: 'message.reaction' },
	{ name: 'Message Read', value: 'message.read' },
	{ name: 'Message Received', value: 'message.received' },
	{ name: 'Message Reply Correlated', value: 'message.reply_correlated' },
	{ name: 'Message Revoked', value: 'message.revoked' },
	{ name: 'Message Sent', value: 'message.sent' },
	{ name: 'Poll Vote', value: 'poll.vote' },
	{ name: 'Schedule Created', value: 'schedule.created' },
	{ name: 'Schedule Sent', value: 'schedule.sent' },
];

export class ChatRailTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ChatRail Trigger',
		name: 'chatRailTrigger',
		icon: { light: 'file:../../icons/chatrail.svg', dark: 'file:../../icons/chatrail.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when ChatRail sends a WhatsApp event',
		defaults: { name: 'ChatRail Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'chatRailApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: EVENTS,
				default: ['message.received'],
				description: 'The events that start this workflow',
			},
			{
				displayName: 'Connection Name or ID',
				name: 'connection',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getConnections' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Only receive events from this number. Leave empty for every number in the workspace. Limiting to one number needs a plan with more than one connection.',
			},
			{
				displayName:
					'ChatRail only delivers to public HTTPS addresses, so this trigger needs an n8n instance reachable from the internet.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	methods = {
		loadOptions: {
			async getConnections(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = (await chatRailRequest.call(this, 'GET', '/v1/connections')) as {
					data?: Array<{ slug: string; name?: string | null }>;
				};
				return [
					{ name: 'All Connections', value: '' },
					...(response.data ?? []).map((c) => ({
						name: c.name ? `${c.name} (${c.slug})` : c.slug,
						value: c.slug,
					})),
				];
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (!staticData.endpointId) return false;

				const url = this.getNodeWebhookUrl('default');
				const response = (await chatRailRequest.call(this, 'GET', '/v1/webhook-endpoints')) as {
					data?: Array<{ id: string; url: string }>;
				};
				const found = (response.data ?? []).some(
					(e) => e.id === staticData.endpointId && e.url === url,
				);
				if (!found) {
					delete staticData.endpointId;
					delete staticData.signingSecret;
				}
				return found;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const body: IDataObject = {
					url: this.getNodeWebhookUrl('default'),
					events: this.getNodeParameter('events') as string[],
					description: `n8n: ${this.getWorkflow().name ?? this.getWorkflow().id}`.slice(0, 200),
				};
				const connection = this.getNodeParameter('connection', '') as string;
				if (connection) body.connection = connection;

				try {
					const response = (await chatRailRequest.call(
						this,
						'POST',
						'/v1/webhook-endpoints',
						body,
					)) as { id?: string; signing_secret?: string };
					if (!response.id || !response.signing_secret) return false;
					// The secret is returned once; it is the only way to verify what arrives.
					staticData.endpointId = response.id;
					staticData.signingSecret = response.signing_secret;
					return true;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.endpointId) {
					try {
						await chatRailRequest.call(
							this,
							'DELETE',
							`/v1/webhook-endpoints/${encodeURIComponent(String(staticData.endpointId))}`,
						);
					} catch (error) {
						// Usually already removed in the dashboard. Deactivation should still succeed,
						// but say so, in case the endpoint is in fact still there.
						this.logger.warn(
							`ChatRail Trigger could not delete webhook endpoint ${String(staticData.endpointId)}: ${(error as Error).message}`,
						);
					}
				}
				delete staticData.endpointId;
				delete staticData.signingSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const staticData = this.getWorkflowStaticData('node');
		const secret = staticData.signingSecret as string | undefined;
		const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8');

		if (!secret || rawBody === undefined || !verifySignature(secret, rawBody, req.headers)) {
			const res = this.getResponseObject();
			res.status(401).json({ error: 'invalid signature' });
			return { noWebhookResponse: true };
		}

		const event = this.getBodyData();
		const events = this.getNodeParameter('events') as string[];
		if (typeof event.type === 'string' && !events.includes(event.type)) {
			// Delivered because the endpoint was changed in the dashboard; acknowledge and ignore.
			return { webhookResponse: 'ignored', workflowData: [] };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(event)],
		};
	}
}

/**
 * ChatRail signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends
 * `chatrail-signature: v1=<hex> [v1=<hex> ...]` (several during a secret rotation) and
 * `chatrail-timestamp: <unix seconds>`.
 */
export function verifySignature(
	secret: string,
	rawBody: string,
	headers: Record<string, string | string[] | undefined>,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	const header = (name: string) => {
		const value = headers[name];
		return Array.isArray(value) ? value[0] : value;
	};
	const signatureHeader = header('chatrail-signature');
	const timestampHeader = header('chatrail-timestamp');
	if (!signatureHeader || !timestampHeader || !/^\d+$/.test(timestampHeader)) return false;

	const timestamp = Number(timestampHeader);
	if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

	const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();
	return signatureHeader
		.split(/\s+/)
		.filter((part) => part.startsWith('v1='))
		.some((part) => {
			const given = Buffer.from(part.slice(3), 'hex');
			return given.length === expected.length && timingSafeEqual(given, expected);
		});
}
