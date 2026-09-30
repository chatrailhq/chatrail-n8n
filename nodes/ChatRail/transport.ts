import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

/** Calls the ChatRail API with the workspace API key from the `chatRailApi` credential. */
export async function chatRailRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	headers?: IDataObject,
) {
	const credentials = await this.getCredentials('chatRailApi');
	const baseUrl = String(credentials.baseUrl ?? 'https://www.chatrail.dev').replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		json: true,
		headers: { Accept: 'application/json', ...(headers ?? {}) },
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;

	return this.helpers.httpRequestWithAuthentication.call(this, 'chatRailApi', options);
}
