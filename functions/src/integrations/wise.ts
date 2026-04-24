export async function createWiseRecipient(_params: {
  userId: string;
  email?: string;
  currency?: string;
  country?: string;
}): Promise<{ recipientId: string }> {
  return { recipientId: "" };
}

export async function createWiseTransfer(_params: {
  recipientId: string;
  amount: number;
  currency: string;
  reference?: string;
}): Promise<{ transferId: string; status: string }> {
  return { transferId: "", status: "PENDING" };
}

export async function getWiseProfileId(): Promise<string> {
  return process.env.WISE_PROFILE_ID || "";
}
