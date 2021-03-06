/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'jquery',
    'ko',
    'uiComponent',
    'Magento_Checkout/js/model/quote',
    'Magento_SalesRule/js/action/set-coupon-code',
    'Magento_Checkout/js/model/full-screen-loader',
    'Magento_SalesRule/js/action/cancel-coupon',
    'mage/url',
    'mage/storage',
    'mage/translate'
], function (
    $, 
    ko, 
    Component, 
    quote, 
    setCouponCodeAction,
    fullScreenLoader, 
    cancelCouponAction,
    urlBuilder,
    storage
) {
    'use strict';

    var totals = quote.getTotals(),
        couponCode = ko.observable(null),
        isApplied;


    if (totals()) {
        couponCode(totals()['coupon_code']);
    }
    isApplied = ko.observable(couponCode() != null);

    return Component.extend({
        defaults: {
            template: 'Magento_SalesRule/payment/discount'
        },
        couponCode: couponCode,
        defaultQuote: quote,
        /**
         * Applied flag
         */
        isApplied: isApplied,

        /**
         * Coupon code application procedure
         */
        apply: function () {
            var self = this;
            if (this.validate()) {
                var response = setCouponCodeAction(couponCode(), isApplied);
                fullScreenLoader.startLoader();
                setTimeout(function(){ 
                    self.initializeIframe(); 
                }, 3000);
                
            }
        },

        /**
         * Cancel using coupon
         */
        cancel: function () {
            var self = this;
            if (this.validate()) {
                var response = couponCode('');
                var response = cancelCouponAction(isApplied);
                fullScreenLoader.startLoader();
                setTimeout(function(){ 
                    self.initializeIframe(); 
                }, 3000);
            }
        },

        /**
         * Coupon form validation
         *
         * @returns {Boolean}
         */
        validate: function () {
            var form = '#discount-form';

            return $(form).validation() && $(form).validation('isValid');
        },

        runPayPal: function(approvalUrl) {
            // fullScreenLoaderPayPal.startLoader();
            var storage;
            var self = this;
            var telephone = '';
            var firstName = '';
            var lastName = '';
            var email = '';
            var taxVat = '';
            var customerData = window.checkoutConfig.customerData;
            var mode = window.checkoutConfig.payment.paypalbr_paypalplus.mode === "1" ? 'sandbox' : 'live';
            
            storage = $.initNamespaceStorage('paypal-data');
            storage = $.localStorage;

            var isEmpty = true;
            for (var i in customerData) {
                if(customerData.hasOwnProperty(i)) {
                    isEmpty = false;
                }
            }
 
            if(isEmpty){
                telephone =  quote.shippingAddress().telephone ? quote.shippingAddress().telephone  : storage.get('telephone');
            }else{
                telephone = quote.shippingAddress().telephone;
            }

            if(isEmpty){
                firstName =  quote.shippingAddress().firstname ? quote.shippingAddress().firstname : storage.get('firstName');
            }else{
                firstName = customerData.firstname;
            }
            
            if(isEmpty){
                lastName =  quote.shippingAddress().lastname ? quote.shippingAddress().lastname : storage.get('lastName');
            }else{
                lastName = customerData.lastname;
            }
            
            if(isEmpty){
                email =  quote.guestEmail ? quote.guestEmail : storage.get('email');
            }else{
                email = customerData.email;
            }

            if(isEmpty){
                taxVat =  quote.shippingAddress().vatId ? quote.shippingAddress().vatId : storage.get('taxVat');
            }else{
                taxVat = customerData.taxvat;
            }
                        

            storage.set(
                'paypal-data',
                {
                    'firstName': firstName,
                    'lastName': lastName,
                    'email': email,
                    'taxVat':taxVat,
                    'telephone': telephone
                }
            );

            if (window.checkoutConfig.payment.paypalbr_paypalplus.iframe_height_active === '1') {
                var height = window.checkoutConfig.payment.paypalbr_paypalplus.iframe_height;
            }else{
                var height = null;
            }


            this.paypalObject = PAYPAL.apps.PPP(
                {
                    "approvalUrl": approvalUrl,
                    "placeholder": "ppplus",
                    "mode": mode,
                    "payerFirstName": firstName,
                    "payerLastName": lastName,
                    "payerPhone": "055"+telephone,
                    "payerEmail": email,
                    "payerTaxId": taxVat,
                    "payerTaxIdType": "BR_CPF",
                    "language": "pt_BR",
                    "country": "BR",
                    "enableContinue": "continueButton",
                    "disableContinue": "continueButton",
                    "rememberedCards": window.checkoutConfig.payment.paypalbr_paypalplus.rememberedCard,
                    "iframeHeight": height,

                    onLoad: function () {
                        fullScreenLoaderPayPal.stopLoader();
                        console.log("Iframe successfully lo aded !");
                        var height = $('#ppplus iframe').css('height');

                        $('#ppplus').css('max-height', height);
                    },
                    onContinue: function (rememberedCardsToken, payerId, token, term) {
                        $('#continueButton').hide();
                        $('#payNowButton').show();

                        self.payerId = payerId;

                        var message = {
                            message: $.mage.__('Payment is being processed.')
                        };
                        self.messageContainer.addSuccessMessage(message);

                        if (typeof term !== 'undefined') {
                            term = term.term;
                            self.term = term.term;
                        }else{
                            term = '1';
                            self.term = term;
                        }

                        $('#paypalbr_paypalplus_rememberedCardsToken').val(rememberedCardsToken);
                        $('#paypalbr_paypalplus_payerId').val(payerId);
                        $('#paypalbr_paypalplus_token').val(token);
                        $('#paypalbr_paypalplus_term').val(term);

                        $('#ppplus').hide();
                        self.placePendingOrder();
                    },

                    /**
                     * Handle iframe error
                     *
                     * @param {type} err
                     * @returns {undefined}
                     */
                    onError: function (err) {
           
                        var message = JSON.stringify(err.cause);
                        var ppplusError = message.replace(/[\\"]/g, '');
                        if (typeof err.cause !== 'undefined') {
                            switch (ppplusError)
                            {

                            case "INTERNAL_SERVICE_ERROR":
                            case "SOCKET_HANG_UP": 
                            case "socket hang up":
                            case "connect ECONNREFUSED":
                            case "connect ETIMEDOUT": 
                            case "UNKNOWN_INTERNAL_ERROR":
                            case "fiWalletLifecycle_unknown_error":
                            case "Failed to decrypt term info": 
                            case "RESOURCE_NOT_FOUND":                 
                            case "INTERNAL_SERVER_ERROR":
                                alert($.mage.__('An unexpected error occurred, please try again.'));
                                location.reload();
                            case "RISK_N_DECLINE": 
                            case "NO_VALID_FUNDING_SOURCE_OR_RISK_REFUSED": 
                                alert($.mage.__('Please use another card if the problem persists please contact PayPal (0800-047-4482).')); 
                                location.reload();
                            case "TRY_ANOTHER_CARD":
                            case "NO_VALID_FUNDING_INSTRUMENT":
                                alert($.mage.__('Your payment was not approved. Please use another card if the problem persists please contact PayPal (0800-047-4482).')); 
                                location.reload();
                            break;
                            case "CARD_ATTEMPT_INVALID":
                                alert ($.mage.__('An unexpected error occurred, please try again.'));
                                location.reload();
                            break;
                            case "INVALID_OR_EXPIRED_TOKEN":
                                alert ($.mage.__('Your session has expired, please try again.'));
                                location.reload();
                            break;
                            case "CHECK_ENTRY":
                                alert ($.mage.__('Please review the credit card data entered.'));
                                location.reload();
                            break;
                            default: //unknown error & reload payment flow
                                alert ($.mage.__('An unexpected error occurred, please try again.')); 
                                location.reload();
                            }
                        }


                    }
                }
            );

            fullScreenLoader.stopLoader();
        },

        initializeIframe: function () {
            var self = this;
            var serviceUrl = urlBuilder.build('paypalplus/payment/index');
            var approvalUrl = '';
            
            storage.post(serviceUrl, '')
            .done(function (response) {
                // console.log(response);
                $('#paypalbr_paypalplus_payId').val(response.id);
                for (var i = 0; i < response.links.length; i++) {
                    if (response.links[i].rel == 'approval_url') {
                        approvalUrl = response.links[i].href;
                    }
                }
                var teste = self.runPayPal(approvalUrl);
            })
            .fail(function (response) {
                console.log("ERROR");
                console.log(response);
                var iframeErrorElem = '#iframe-error';

                $(iframeErrorElem).html('');
                $(iframeErrorElem).append($.mage.__('<div><span>Error loading the payment method. Please try again, if problem persists contact us.</span></div>'));

                $(iframeErrorElem).show();
                $('#iframe-warning').hide();
                $('#continueButton').prop("disabled", true);
                fullScreenLoaderPayPal.stopLoader();
            })
            .always(function () {
                // fullScreenLoader.stopLoader();
            });
        }
    });
});
