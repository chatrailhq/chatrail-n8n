import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import { chatRailRequest } from './transport';

/** The API accepts at most this many numbers per check. */
const CHECK_BATCH_MAX = 10;

export class ChatRail implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ChatRail',
		name: 'chatRail',
		icon: { light: 'file:../../icons/chatrail.svg', dark: 'file:../../icons/chatrail.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages and check numbers with the ChatRail API',
		defaults: { name: 'ChatRail' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'chatRailApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Message', value: 'message' },
					{ name: 'Number', value: 'number' },
					{ name: 'Connection', value: 'connection' },
				],
				default: 'message',
			},

			// ---- Message ------------------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Send',
						value: 'send',
						action: 'Send a message',
						description: 'Send a text or media message from a connected number',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a message',
						description: 'Get a message and its delivery status',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Connection Name or ID',
				name: 'connection',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getConnections' },
				required: true,
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'The connected WhatsApp number to use. With an expression, use the connection slug.',
				displayOptions: {
					show: { resource: ['message', 'number'], operation: ['send', 'check'] },
				},
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+923001234567',
				description: 'Recipient phone number in international format, with the country code',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Text',
				name: 'body',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'The message text. With media, this is the caption.',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				options: [
					{
						displayName: 'Context (JSON)',
						name: 'context',
						type: 'json',
						default: '{}',
						description:
							'Data behind this alert, for example an order or a booking. Replies are matched back to it, and AI replies can answer from it.',
					},
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						description:
							'Sending twice with the same key sends once. Leave empty to use one key per item in this execution, so a retry of the node cannot send twice.',
					},
					{
						displayName: 'Media File Name',
						name: 'mediaFilename',
						type: 'string',
						default: '',
						description: 'File name shown for a document',
					},
					{
						displayName: 'Media Type',
						name: 'mediaKind',
						type: 'options',
						options: [
							{ name: 'Audio', value: 'audio' },
							{ name: 'Detect From URL', value: '' },
							{ name: 'Document', value: 'document' },
							{ name: 'Image', value: 'image' },
							{ name: 'Video', value: 'video' },
						],
						default: '',
					},
					{
						displayName: 'Media URL',
						name: 'mediaUrl',
						type: 'string',
						default: '',
						placeholder: 'https://example.com/invoice.pdf',
						description: 'A public HTTPS link to an image, video, audio file or document to attach',
					},
					{
						displayName: 'Metadata (JSON)',
						name: 'metadata',
						type: 'json',
						default: '{}',
						description:
							'Your own references, returned on webhooks for this message. Never sent to WhatsApp.',
					},
					{
						displayName: 'Reply To Message ID',
						name: 'replyTo',
						type: 'string',
						default: '',
						description: 'ChatRail ID of a message in the same chat to quote',
					},
					{
						displayName: 'Send At',
						name: 'sendAt',
						type: 'dateTime',
						default: '',
						description: 'Schedule the message instead of sending it now',
					},
				],
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ChatRail message ID, as returned when it was sent',
				displayOptions: { show: { resource: ['message'], operation: ['get'] } },
			},

			// ---- Number -------------------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['number'] } },
				options: [
					{
						name: 'Check',
						value: 'check',
						action: 'Check whether numbers can receive messages',
						description:
							'Check up to 10 numbers through a connected number. Answers from the last 24 hours are reused.',
					},
				],
				default: 'check',
			},
			{
				displayName: 'Phone Numbers',
				name: 'phones',
				type: 'string',
				required: true,
				default: '',
				placeholder: '+923001234567, +2348031234567',
				description:
					'Up to 10 numbers in international format, separated by commas or new lines. Each number is returned as its own item.',
				displayOptions: { show: { resource: ['number'], operation: ['check'] } },
			},

			// ---- Connection ---------------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['connection'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get connected numbers',
						description: 'List the WhatsApp numbers in the workspace and their state',
					},
				],
				default: 'getAll',
			},
		],
	};

	methods = {
		loadOptions: {
			async getConnections(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = (await chatRailRequest.call(this, 'GET', '/v1/connections')) as {
					data?: Array<{ slug: string; name?: string | null; state?: string }>;
				};
				return (response.data ?? []).map((c) => ({
					name: c.name ? `${c.name} (${c.slug})` : c.slug,
					value: c.slug,
					description: c.state ? `State: ${c.state}` : undefined,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'message' && operation === 'send') {
					const response = await sendMessage.call(this, i);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
				} else if (resource === 'message' && operation === 'get') {
					const id = (this.getNodeParameter('messageId', i) as string).trim();
					const response = await chatRailRequest.call(
						this,
						'GET',
						`/v1/messages/${encodeURIComponent(id)}`,
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
				} else if (resource === 'number' && operation === 'check') {
					const connection = this.getNodeParameter('connection', i) as string;
					const phones = (this.getNodeParameter('phones', i) as string)
						.split(/[\n,;]+/)
						.map((p) => p.trim())
						.filter(Boolean);
					if (phones.length === 0 || phones.length > CHECK_BATCH_MAX) {
						throw new NodeOperationError(
							this.getNode(),
							`Enter between 1 and ${CHECK_BATCH_MAX} phone numbers.`,
							{ itemIndex: i },
						);
					}
					const response = (await chatRailRequest.call(this, 'POST', '/v1/numbers/check', {
						connection,
						phones,
					})) as { results?: IDataObject[] };
					for (const result of response.results ?? []) {
						returnData.push({ json: result, pairedItem: { item: i } });
					}
				} else if (resource === 'connection' && operation === 'getAll') {
					const response = (await chatRailRequest.call(this, 'GET', '/v1/connections')) as {
						data?: IDataObject[];
					};
					for (const connection of response.data ?? []) {
						returnData.push({ json: connection, pairedItem: { item: i } });
					}
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation "${operation}" for resource "${resource}".`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

function parseJsonField(
	this: IExecuteFunctions,
	value: unknown,
	field: string,
	itemIndex: number,
): IDataObject | undefined {
	if (value === undefined || value === '' || value === '{}') return undefined;
	if (typeof value === 'object' && value !== null) return value as IDataObject;
	let parsed: unknown;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		parsed = undefined;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), `${field} must be a JSON object.`, {
			itemIndex,
		});
	}
	return Object.keys(parsed).length ? (parsed as IDataObject) : undefined;
}

async function sendMessage(this: IExecuteFunctions, i: number) {
	const connection = this.getNodeParameter('connection', i) as string;
	const to = (this.getNodeParameter('to', i) as string).trim();
	const text = this.getNodeParameter('body', i) as string;
	const extra = this.getNodeParameter('additionalFields', i) as IDataObject;

	const body: IDataObject = { connection, to };
	if (text) body.body = text;

	if (extra.mediaUrl) {
		const media: IDataObject = { url: extra.mediaUrl };
		if (extra.mediaKind) media.kind = extra.mediaKind;
		if (extra.mediaFilename) media.filename = extra.mediaFilename;
		body.media = media;
	}
	if (!body.body && !body.media) {
		throw new NodeOperationError(this.getNode(), 'Add some text or a media URL to send.', {
			itemIndex: i,
		});
	}

	const context = parseJsonField.call(this, extra.context, 'Context', i);
	if (context) body.context = context;
	const metadata = parseJsonField.call(this, extra.metadata, 'Metadata', i);
	if (metadata) body.metadata = metadata;
	if (extra.replyTo) body.reply_to = extra.replyTo;
	if (extra.sendAt) body.send_at = new Date(extra.sendAt as string).toISOString();

	// One key per item per execution: n8n's "retry on fail" re-sends the same request, and the
	// API turns the repeat into the original answer instead of a second WhatsApp message.
	const idempotencyKey =
		(extra.idempotencyKey as string) ||
		`n8n-${this.getExecutionId()}-${this.getNode().id}-${i}`;

	return chatRailRequest.call(this, 'POST', '/v1/messages/text', body, undefined, {
		'Idempotency-Key': idempotencyKey,
	});
}
