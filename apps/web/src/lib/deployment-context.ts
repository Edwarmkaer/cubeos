import {createContext,useContext} from 'react';
import type {AuthConfig} from './auth-config';
export const DeploymentContext=createContext<AuthConfig['mode']>('local');
export const useDeploymentMode=()=>useContext(DeploymentContext);
