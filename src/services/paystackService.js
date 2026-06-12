const axios = require('axios');

class PaystackService {
    async initializeTransaction(email, amountInPesewas, metadata = {}) {
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || 'https://app.craftedclimate.com/payment/callback';

        // Mock mode for testing/local env without keys
        if (process.env.NODE_ENV === 'development' || !secretKey) {
            console.log(`[PaystackService] MOCK Initializing transaction for ${email}, amount: ${amountInPesewas} Pesewas`);
            const mockReference = `ref-mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            return {
                authorization_url: `https://checkout.paystack.com/mock-checkout?ref=${mockReference}`,
                reference: mockReference
            };
        }

        try {
            const response = await axios.post('https://api.paystack.co/transaction/initialize', {
                email,
                amount: amountInPesewas,
                currency: process.env.PAYMENT_CURRENCY || 'GHS',
                callback_url: callbackUrl,
                metadata
            }, {
                headers: {
                    Authorization: `Bearer ${secretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.status) {
                return {
                    authorization_url: response.data.data.authorization_url,
                    reference: response.data.data.reference
                };
            }
            throw new Error(response.data.message || 'Failed to initialize Paystack transaction');
        } catch (error) {
            console.error('[PaystackService] Initialization Error:', error.response?.data || error.message);
            throw new Error('Paystack initialization failed: ' + (error.response?.data?.message || error.message));
        }
    }

    async verifyTransaction(reference) {
        const secretKey = process.env.PAYSTACK_SECRET_KEY;

        if (process.env.NODE_ENV === 'development' || !secretKey) {
            console.log(`[PaystackService] MOCK Verifying transaction ref: ${reference}`);
            return {
                status: true,
                message: 'Verification successful',
                data: {
                    status: 'success',
                    reference,
                    amount: 9900 // Mock amount
                }
            };
        }

        try {
            const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
                headers: {
                    Authorization: `Bearer ${secretKey}`
                }
            });

            if (response.data && response.data.status) {
                return response.data;
            }
            throw new Error(response.data.message || 'Failed to verify Paystack transaction');
        } catch (error) {
            console.error('[PaystackService] Verification Error:', error.response?.data || error.message);
            throw new Error('Paystack verification failed: ' + (error.response?.data?.message || error.message));
        }
    }
}

module.exports = new PaystackService();
