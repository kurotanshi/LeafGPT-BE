import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/users.js';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const URI = process.env.ATLAS_URI;
const PORT = process.env.PORT || 5000;
const SALT_ROUNDS = 10;
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.DEFAULT_EMAIL,
        pass: process.env.DEFAULT_PASSWORD
    }
});
const connectToDB = async () => {
    try {
        await mongoose.connect(URI);
        console.log('\x1b[36m', '-- Connected to MongoDB');
        app.listen(PORT, () => console.log('\x1b[36m', `-- Server is running on port: ${PORT}`));
    }
    catch (err) {
        console.log(err);
    }
};
connectToDB();
const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: process.env.DEFAULT_EMAIL,
        to: to,
        subject: subject,
        text: text
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent ' + info.response);
    }
    catch (err) {
        console.log(err);
    }
};
app.post('/api/auth/sendVerificationEmail', async (req, res) => {
    const { email, password } = req.body;
    const verificationToken = uuidv4();
    try {
        const emailAlreadyRegistered = await User.findOne({ email });
        if (emailAlreadyRegistered) {
            res.send({ message: 'Email already registered' });
            return;
        }
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const newUser = new User({ email, password: hashedPassword, verificationToken });
        await newUser.save();
        sendEmail(email, 'Verify your email', `Click on this link to verify your email http://localhost:3000/auth/verify/${verificationToken}`);
        res.status(200).send({ message: 'Verification email sent' });
    }
    catch (err) {
        console.log(err);
    }
});
const verifyEmail = async (verificationToken) => {
    try {
        const user = await User.findOne({ verificationToken });
        if (!user) {
            return 'Invalid token';
        }
        if (user.verified) {
            return 'Email already verified';
        }
        if (user.expiresAt && user.expiresAt < Date.now()) {
            return 'Token expired';
        }
        await User.updateOne({ verificationToken }, { verified: true });
        return 'Email verified';
    }
    catch (err) {
        console.log(err);
        return 'Server error';
    }
};
app.get('/api/auth/verify/:verificationToken', async (req, res) => {
    const { verificationToken } = req.params;
    const message = await verifyEmail(verificationToken);
    res.send({ message: message });
});
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            res.send({ message: 'Email not registered' });
            return;
        }
        if (!user.verified) {
            res.send({ message: 'Email not verified' });
            return;
        }
        if (!(await bcrypt.compare(password, user.password))) {
            res.send({ message: 'Incorrect password' });
            return;
        }
        const id = user._id;
        const token = jwt.sign({ id: id, email: email }, process.env.JWT_SECRET);
        res.status(200).send({ message: 'Login successful', token: token, id: id, email: email });
    }
    catch (err) {
        console.log(err);
        res.send({ message: 'Server error' });
    }
});
