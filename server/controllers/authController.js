const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const { isConnected } = require('../config/db');
const { loginSchema, registerSchema } = require('@estate-manager/shared/schemas');

const MOCK_USERS = {
  'superadmin@estatemanager.io': {
    _id: 'usr_superadmin_01',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'superadmin@estatemanager.io',
    phone: '+234 800 000 0001',
    role: 'SUPER_ADMIN',
    accessControlStatus: 'ENABLED',
    isActive: true
  },
  'admin@estatemanager.io': {
    _id: 'usr_admin_01',
    firstName: 'Tola',
    lastName: 'Balogun',
    email: 'admin@estatemanager.io',
    phone: '+234 801 234 5678',
    role: 'ESTATE_ADMIN',
    accessControlStatus: 'ENABLED',
    isActive: true
  },
  'guard@estatemanager.io': {
    _id: 'usr_guard_01',
    firstName: 'Musa',
    lastName: 'Ibrahim',
    email: 'guard@estatemanager.io',
    phone: '+234 802 345 6789',
    role: 'GUARD',
    accessControlStatus: 'ENABLED',
    isActive: true
  },
  'resident@estatemanager.io': {
    _id: 'usr_resident_01',
    firstName: 'Adeola',
    lastName: 'Johnson',
    email: 'resident@estatemanager.io',
    phone: '+234 803 123 4567',
    role: 'RESIDENT',
    accessControlStatus: 'ENABLED',
    isActive: true
  }
};

const generateTokens = (user) => {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    accessControlStatus: user.accessControlStatus
  };

  const accessToken = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });

  const refreshToken = jwt.sign(payload, config.refreshTokenSecret, {
    expiresIn: config.refreshTokenExpiresIn
  });

  return { accessToken, refreshToken };
};

exports.register = async (req, res, next) => {
  try {
    const validated = registerSchema.parse(req.body);

    const existingUser = await User.findOne({ email: validated.email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_ALREADY_REGISTERED',
        message: 'A user with this email address already exists.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(validated.password, salt);

    const newUser = await User.create({
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: validated.email,
      phone: validated.phone,
      password: hashedPassword,
      role: validated.role
    });

    const { accessToken, refreshToken } = generateTokens(newUser);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 3600000
    });

    const userObj = newUser.toObject();
    delete userObj.password;

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      data: {
        user: userObj,
        token: accessToken,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);

    if (!isConnected()) {
      const mockUser = MOCK_USERS[validated.email];
      if (mockUser) {
        const { accessToken, refreshToken } = generateTokens(mockUser);
        res.cookie('access_token', accessToken, {
          httpOnly: true,
          secure: config.env === 'production',
          sameSite: 'lax',
          maxAge: 3600000
        });
        return res.json({
          success: true,
          message: 'Login successful (Preview Mode).',
          data: {
            user: mockUser,
            token: accessToken,
            refreshToken
          }
        });
      }
    }

    const user = await User.findOne({ email: validated.email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      });
    }

    const isMatch = await bcrypt.compare(validated.password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated. Contact an administrator.'
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 3600000
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: userObj,
        token: accessToken,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Current user session is no longer active.'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = (req, res) => {
  res.clearCookie('access_token');
  res.json({
    success: true,
    message: 'Logged out successfully.'
  });
};
