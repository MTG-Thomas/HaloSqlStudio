import React from "react";
import { Tabs } from "./Tabs";

export const Editor: React.FC = () => {
    return (
        <div className="flex flex-col h-full">
            <Tabs />
            {/* Main content area will be handled by individual tabs */}
        </div>
    );
};
