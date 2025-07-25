import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { User } from '../models/user.model.js';

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const AccessToken = user.generateAccessToken();
        const RefreshToken = user.generateRefreshToken();

        user.refreshToken = RefreshToken;
        await user.save({
            validateBeforeSave: false
        })

        return { AccessToken, RefreshToken };
    } catch (error) {
        throw new ApiError(500, "Token Generation failed - Internal Server error.")
    }
}


const registerUser = asyncHandler(async (req, res) => {
    const { fullname, username, email, password } = req.body;

    if (!fullname || !username || !email || !password) {
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existedUser) {
        throw new ApiError(409, "User already exists with this email or username");
    }

    const user = await User.create({
        fullname,
        username: username.toLowerCase(),
        email,
        password,
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while creating user");
    }

    // 💥 Generate access & refresh tokens
    const { AccessToken, RefreshToken } = await generateAccessAndRefreshTokens(user._id);

    // 🍪 Cookie options
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    };

    // 🎉 Send tokens as cookies + user data in response
    return res
        .status(201)
        .cookie("accessToken", AccessToken, options)
        .cookie("refreshToken", RefreshToken, options)
        .json(
            new ApiResponse(
                201,
                {
                    user: createdUser,
                    AccessToken,
                    RefreshToken,
                },
                "User registered and logged in successfully"
            )
        );
});

const loginUser = asyncHandler(async (req, res) => {
    if (!req.body) {
        throw new ApiError(400, "Request body is missing.")
    }

    const { email, username, password } = req.body;

    // check for username or email --- either can be used for login,
    if (!(username || email)) {
        throw new ApiError(400, "Email or Username is Required.")
    }

    // check if password is provided.
    if (!password) {
        throw new ApiError(400, "Password is required.")
    }

    // finding the user.

    const user = await User.findOne({
        $or: [{ email }, { username }]
    })

    if (!user) {
        throw new ApiError(404, "User does not Exist.")
    }

    // check for the password -- here we know the user exists.

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid User credentials.")
    }

    // generate Access and Refresh Token
    const { AccessToken, RefreshToken } = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }

    return res
        .status(200)
        .cookie("accessToken", AccessToken, options)
        .cookie("refreshToken", RefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    AccessToken,
                    RefreshToken
                },
                "User LoggedIn successfully."
            )
        )

})

const logoutUser = asyncHandler(async (req, res) => {
    // remove the refreshtoken from db
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refershToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"))

})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid Old password")
    }

    user.password = newPassword;
    await user.save({
        validateBeforeSave: false
    });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "password changed sucessfully")
        )
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched"))
})


export { registerUser, loginUser, logoutUser, changeCurrentPassword, getCurrentUser }