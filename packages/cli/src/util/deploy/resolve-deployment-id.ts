import type Client from '../client';
import getDeployment from '../get-deployment';

/**
 * Resolves a deployment URL or ID to the actual deployment ID.
 * If the input is already a deployment ID (dpl_xxx), returns it directly
 * without making an API call. Otherwise, fetches the deployment by
 * URL/hostname and returns the ID.
 *
 * @param client - The Vercel CLI client instance.
 * @param contextName - The scope context/team name.
 * @param urlOrId - A deployment URL (e.g., https://xxx.vercel.app) or ID (dpl_xxx).
 * @returns The deployment ID.
 */
export async function resolveDeploymentId(
  client: Client,
  contextName: string,
  urlOrId: string
): Promise<string> {
  if (urlOrId.startsWith('dpl_')) {
    return urlOrId;
  }
  const deployment = await getDeployment(client, contextName, urlOrId);
  return deployment.id;
}
