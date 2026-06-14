const userService = require('./user.service');

class UserController {
    async signup(req, res) {
        try {
            const { username, email, password, invitationId, contact, firstName, lastName, country } = req.body;

            if (!username || !email || !password) {
                return res.status(400).send({ message: 'Please provide username, email, and password' });
            }

            const result = await userService.signup({
                username, email: email.toLowerCase(), password, invitationId, contact, firstName, lastName, country,
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

            const result = await userService.login({ email: email.toLowerCase(), password });
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

            const result = await userService.verifyOtp({ email: email.toLowerCase(), otp });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('Invalid') || error.message.includes('expired')) return res.status(400).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async resendOtp(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: 'Email is required' });

            const result = await userService.resendOtp({ email: email.toLowerCase() });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('wait') || error.message.includes('verified')) return res.status(400).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async getProfile(req, res) {
        try {
            const user = await userService.getUserById(req.user.userid);
            res.status(200).json({
                message: 'User profile retrieved successfully',
                user
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return res.status(400).json({ message: 'Refresh Token is required' });

            const result = await userService.refreshToken(refreshToken);
            res.status(200).json({
                message: 'Token refreshed successfully',
                ...result
            });
        } catch (error) {
            if (error.message.includes('expired') || error.message.includes('Invalid')) {
                return res.status(401).json({ message: error.message }); // 401 for auth issues
            }
            if (error.message.includes('Suspended')) {
                return res.status(403).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: 'Email is required' });

            const result = await userService.forgotPassword({ email: email.toLowerCase() });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            res.status(500).json({ message: error.message });
        }
    }

    async resetPassword(req, res) {
        try {
            const { email, otp, newPassword } = req.body;
            if (!email || !otp || !newPassword) {
                return res.status(400).json({ message: 'Email, OTP, and newPassword are required' });
            }

            const result = await userService.resetPassword({ email: email.toLowerCase(), otp, newPassword });
            res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('Invalid') || error.message.includes('expired')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }
    async updateProfile(req, res) {
        try {
            const userId = req.user.userid;
            const updateData = req.body;

            // Handle Multipart/Form-Data parsing nuances
            if (updateData.socialLinks && typeof updateData.socialLinks === 'string') {
                try {
                    updateData.socialLinks = JSON.parse(updateData.socialLinks);
                } catch (e) {
                    console.error("Failed to parse socialLinks:", e);
                }
            }

            // Whitelist allowed fields for profile update
            const allowedFields = ['firstName', 'lastName', 'contact', 'jobTitle', 'bio', 'socialLinks'];
            const filteredUpdate = Object.keys(updateData)
                .filter(key => allowedFields.includes(key))
                .reduce((obj, key) => {
                    // Filter out null, undefined, and empty strings
                    if (updateData[key] !== null && updateData[key] !== undefined && updateData[key] !== "") {
                        obj[key] = updateData[key];
                    }
                    return obj;
                }, {});

            // Pass file if present
            if (req.file) {
                filteredUpdate.file = req.file;
            }

            if (Object.keys(filteredUpdate).length === 0 && !req.file) {
                return res.status(400).json({ message: 'No valid fields provided for update' });
            }

            const updatedUser = await userService.updateProfile(userId, filteredUpdate);
            res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async updatePreferences(req, res) {
        try {
            const userId = req.user.userid;
            const { preferences, notificationSettings } = req.body;

            if (!preferences && !notificationSettings) {
                return res.status(400).json({ message: 'Provide preferences or notificationSettings to update' });
            }

            const updatedUser = await userService.updatePreferences(userId, { preferences, notificationSettings });
            res.status(200).json({ message: 'Preferences updated successfully', user: updatedUser });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async changePassword(req, res) {
        try {
            const userId = req.user.userid;
            const { oldPassword, newPassword } = req.body;

            if (!oldPassword || !newPassword) {
                return res.status(400).json({ message: 'Old and new passwords are required' });
            }

            if (oldPassword === newPassword) {
                return res.status(400).json({ message: 'New password cannot be the same as the old password' });
            }

            await userService.changePassword(userId, oldPassword, newPassword);
            res.status(200).json({ message: 'Password changed successfully' });
        } catch (error) {
            if (error.message === 'Incorrect password') {
                return res.status(401).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async muteDevice(req, res) {
        try {
            const userId = req.user.userid;
            const { deviceId } = req.params;
            await userService.muteDevice(userId, deviceId);
            res.status(200).json({ message: 'Device muted successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async unmuteDevice(req, res) {
        try {
            const userId = req.user.userid;
            const { deviceId } = req.params;
            await userService.unmuteDevice(userId, deviceId);
            res.status(200).json({ message: 'Device unmuted successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getMutedDevices(req, res) {
        try {
            const userId = req.user.userid;
            const muted = await userService.getMutedDevices(userId);
            res.status(200).json({ mutedDevices: muted });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async backofficeLogin(req, res) {
        try {
            const { email, password } = req.body;
            const result = await userService.initiateBackofficeLogin({ email, password });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Login Error:', error.message);
            if (error.message.includes('User not found') || error.message.includes('Invalid Password')) {
                return res.status(401).json({ message: error.message });
            }
            if (error.message.includes('restricted') || error.message.includes('Suspended')) {
                return res.status(403).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async backofficeVerifyOtp(req, res) {
        try {
            const { tempSessionId, otp } = req.body;
            const result = await userService.verifyBackofficeOtp({ tempSessionId, otp });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Verify OTP Error:', error.message);
            if (error.message.includes('expired') || error.message.includes('invalid') || error.message.includes('Invalid OTP')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async requestAdminPasswordReset(req, res) {
        try {
            const { email } = req.body;
            const result = await userService.requestAdminPasswordReset({ email });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Password Request Error:', error.message);
            if (error.message.includes('restricted') || error.message.includes('Unauthorized')) {
                return res.status(403).json({ message: error.message });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    async backofficeResetPassword(req, res) {
        try {
            const { requestId, token, newPassword } = req.body;
            const result = await userService.resetBackofficePassword({ requestId, token, newPassword });
            res.status(200).json(result);
        } catch (error) {
            console.error('[UserController] Backoffice Password Reset Error:', error.message);
            if (error.message.includes('not authorized') || error.message.includes('Invalid') || error.message.includes('expired')) {
                return res.status(400).json({ message: error.message });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new UserController();
