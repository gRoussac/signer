import React from 'react';
import logo from '../img/CasperLabs_Logo_Favicon_RGB_50px.png';
import {
  Button,
  createStyles,
  FormControl,
  Theme,
  WithStyles
} from '@material-ui/core';
import { Link, Redirect } from 'react-router-dom';
import AccountManager from '../container/AccountManager';
import { HomeContainer } from '../container/HomeContainer';
import { observer } from 'mobx-react';
import Pages from './Pages';
import { confirm } from './Confirmation';
import { RouteComponentProps, withRouter } from 'react-router';
import { TextFieldWithFormState } from './Forms';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import withStyles from '@material-ui/core/styles/withStyles';

/* eslint-disable jsx-a11y/anchor-is-valid */
const styles = (theme: Theme) =>
  createStyles({
    margin: {
      marginTop: '20px'
    },
    alignCenter: {
      textAlign: 'center'
    }
  });

interface Props extends RouteComponentProps, WithStyles<typeof styles> {
  authContainer: AccountManager;
  homeContainer: HomeContainer;
}

@observer
class Home extends React.Component<Props, {}> {
  renderCreateNewVault() {
    return (
      <div>
        <Grid
          container
          spacing={4}
          direction={'column'}
          justify={'flex-start'}
          alignItems={'center'}
        >
          <Grid item className={this.props.classes.alignCenter}>
            <img src={logo} alt="logo" width={120} />
            <Typography variant={'h4'} align={'center'}>
              New Vault
            </Typography>
          </Grid>

          <Grid item container>
            <form style={{ textAlign: 'center' }}>
              <FormControl fullWidth>
                <TextFieldWithFormState
                  fieldState={this.props.homeContainer.passwordField}
                  required
                  label={'Set Password'}
                  type={'password'}
                />
              </FormControl>
              <FormControl fullWidth className={this.props.classes.margin}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={this.props.homeContainer.submitDisabled}
                  onClick={async () => {
                    const password = this.props.homeContainer.passwordField.$;
                    await this.props.authContainer.createNewVault(password);
                    this.props.homeContainer.passwordField.reset();
                  }}
                >
                  Create Vault
                </Button>
              </FormControl>
            </form>
          </Grid>
        </Grid>
      </div>
    );
  }

  renderAccountLists() {
    return (
      <div>
        <Grid
          container
          spacing={4}
          direction={'column'}
          justify={'flex-start'}
          alignItems={'center'}
        >
          <Grid item className={this.props.classes.alignCenter}>
            <img src={logo} alt="logo" width={120} />
            <Typography variant={'h6'} align={'center'}>
              You have {this.props.authContainer.userAccounts.length} account
              key(s)
            </Typography>
            {this.props.authContainer.selectedUserAccount && (
              <Typography variant={'h6'} align={'center'}>
                Active key:{' '}
                <span style={{ wordBreak: 'break-all' }}>
                  {this.props.authContainer.selectedUserAccount.name}
                </span>
              </Typography>
            )}
          </Grid>

          <Grid item>
            <FormControl fullWidth className={this.props.classes.margin}>
              <Button
                component={Link}
                variant="contained"
                color="primary"
                to={Pages.ImportAccount}
              >
                Import Account
              </Button>
            </FormControl>

            <FormControl fullWidth className={this.props.classes.margin}>
              <Button
                component={Link}
                variant="contained"
                color="primary"
                to={Pages.CreateAccount}
              >
                Creating Account
              </Button>
            </FormControl>
          </Grid>
        </Grid>
      </div>
    );
  }

  resetVaultOnClick() {
    confirm(
      <div className="text-danger">Danger!!!</div>,
      'Resetting vault will delete all imported accounts.'
    ).then(() => this.props.authContainer.resetVault());
  }

  renderUnlock() {
    return (
      <div>
        <Grid
          container
          spacing={4}
          direction={'column'}
          justify={'flex-start'}
          alignItems={'center'}
        >
          <Grid item className={this.props.classes.alignCenter}>
            <img src={logo} alt="logo" width={120} />
            <Typography variant={'h4'} align={'center'}>
              Unlock Vault
            </Typography>
          </Grid>

          <Grid item container>
            <form style={{ textAlign: 'center' }}>
              <FormControl fullWidth>
                <TextFieldWithFormState
                  fieldState={this.props.homeContainer.passwordField}
                  required
                  id={'unlock-password'}
                  label={'Password'}
                  type={'password'}
                />
              </FormControl>
              <FormControl fullWidth className={this.props.classes.margin}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={this.props.homeContainer.submitDisabled}
                  onClick={async () => {
                    let password = this.props.homeContainer.passwordField.$;
                    try {
                      await this.props.authContainer.unlock(password);
                      this.props.homeContainer.passwordField.reset();
                    } catch (e) {
                      this.props.homeContainer.passwordField.setError(
                        e.message
                      );
                    }
                  }}
                >
                  Unlock
                </Button>
              </FormControl>
              <div className="reset-vault">
                <a
                  href="#"
                  className="text-danger"
                  onClick={() => this.resetVaultOnClick()}
                >
                  Reset Vault?
                </a>
              </div>
            </form>
          </Grid>
        </Grid>
      </div>
    );
  }

  render() {
    if (this.props.authContainer.hasCreatedVault) {
      if (this.props.authContainer.isUnLocked) {
        if (this.props.authContainer.toSignMessages.length > 0) {
          return <Redirect to={Pages.SignMessage} />;
        } else {
          return this.renderAccountLists();
        }
      } else {
        return this.renderUnlock();
      }
    } else {
      return this.renderCreateNewVault();
    }
  }
}

export default withStyles(styles, { withTheme: true })(withRouter(Home));
