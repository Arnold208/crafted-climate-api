const crypto = require('crypto');
const subscriptionService = require('./subscription.service');
const OrganizationRequest = require('../../models/organization/organizationRequestModel');
const PaymentTransaction = require('../../models/subscriptions/PaymentTransaction');

class PaystackWebhookController {
    async handleWebhook(req, res) {
        const signature = req.headers['x-paystack-signature'];
        const secret = process.env.PAYSTACK_SECRET_KEY;

        // Verify signature
        if (process.env.NODE_ENV !== 'development' && secret) {
            if (!signature) {
                return res.status(401).json({ message: 'Missing X-Paystack-Signature' });
            }

            const bodyContent = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
            const hash = crypto.createHmac('sha512', secret).update(bodyContent).digest('hex');

            if (hash !== signature) {
                console.error('[PaystackWebhook] Signature verification failed');
                return res.status(401).json({ message: 'Invalid signature' });
            }
        }

        const event = req.body;
        console.log(`[PaystackWebhook] Received event: ${event.event}`);

        if (event.event === 'charge.success') {
            const data = event.data;
            const metadata = data.metadata || {};
            const { organizationId, planId, billingCycle, userId, requestId } = metadata;
            const reference = data.reference;
            const amount = data.amount / 100; // convert from minor unit

            try {
                // Check if this was an onboarding organization request
                if (requestId) {
                    console.log(`[PaystackWebhook] Processing onboarding request payment for Request: ${requestId}`);
                    const orgReq = await OrganizationRequest.findOne({ requestId });
                    if (orgReq) {
                        orgReq.paymentStatus = 'success';
                        orgReq.paymentReference = reference;
                        orgReq.pricePaid = amount;
                        // Change status from 'payment_pending' to 'pending' (ready for admin review)
                        orgReq.status = 'pending';
                        await orgReq.save();
                        console.log(`[PaystackWebhook] Onboarding request ${requestId} updated to pending (paid).`);
                    } else {
                        console.warn(`[PaystackWebhook] Onboarding request ${requestId} not found.`);
                    }
                } else if (organizationId && planId && userId) {
                    console.log(`[PaystackWebhook] Processing direct subscription upgrade/renewal for Org: ${organizationId}`);
                    // Upgrade the subscription
                    await subscriptionService.upgradeOrgSubscription(organizationId, planId, userId);
                    console.log(`[PaystackWebhook] Org subscription successfully upgraded/renewed.`);
                }

                // Record the transaction
                if (reference) {
                    await PaymentTransaction.findOneAndUpdate(
                        { reference },
                        {
                            transactionId: data.id || `tx-${Date.now()}`,
                            reference,
                            organizationId: organizationId || 'onboarding',
                            planId: planId || 'unknown',
                            billingCycle: billingCycle || 'monthly',
                            amount,
                            status: 'success',
                            userId: userId || 'unknown'
                        },
                        { upsert: true, new: true }
                    );
                }

            } catch (error) {
                console.error('[PaystackWebhook] Error processing charge.success:', error.message);
                return res.status(500).json({ error: error.message });
            }
        }

        // Always return 200 to Paystack to acknowledge receipt
        return res.status(200).json({ status: 'success' });
    }
}

module.exports = new PaystackWebhookController();
