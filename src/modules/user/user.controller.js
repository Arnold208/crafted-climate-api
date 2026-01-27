const userService = require('./user.service');

class UserController {
    async signup(req, res) {
        try {
            const { username, email, password, invitationId, contact, firstName, lastName } = req.body;

            if (!username || !email || !password) {
                return res.status(400).send({ message: 'Please provide username, email, and password' });
            }

            const result = await userService.signup({
                username, email, password, invitationId, contact, firstName, lastName,
                file: req.file
            });

            return res.status(201).send({
                message: 'User registered successfully',
                ...result
            });

        } catch (error) {
            console.error('[UserController] Signup Error:', error);
            if (error.message.includes('exists') || error.message.includes('Invalid')) {
                return res.status(400).send({ message: error.message });
            }
            return res.status(500).send({ message: 'Internal server error', error: error.message });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).send({ message: 'Please provide email and password' });
            }

            const result = await userService.login({ email, password });
            return res.status(200).send(result);
        } catch (error) {
            console.error('[UserController] Login Error:', error.message);
            if (error.message === 'User not found' || error.message === 'Invalid Password' || error.message === 'Account not verified') {
                return res.status(401).send({ message: error.message });
            }
            if (error.message.includes('provide email')) {
                return res.status(400).send({ message: error.message });
            }
            return res.status(500).send({ message: 'Internal server error', error: error.message });
        }
    }

    async verifyOtp(req, res) {
        try {
            const { email, otp } = req.body;
            if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

            const result = await userService.verifyOtp({ email, otp });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('Invalid') || error.message.includes('expired')) return res.status(400).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async resendOtp(req, res) {
        // ...
    }

    async getProfile(req, res) {
        try {
            const user = await userService.getUserById(req.user.userid);
            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new UserController();
